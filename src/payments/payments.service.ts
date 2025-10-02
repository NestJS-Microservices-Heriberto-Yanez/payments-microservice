import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Request, Response } from 'express';
import { envs, NATS_SERVICE } from 'src/config';
import { PaymentSessionDto } from 'src/payments/dto/payment-session.dto';
import Stripe from 'stripe';

@Injectable()
export class PaymentsService {
    private readonly stripe = new Stripe(envs.stripeSecret);
    private readonly logger = new Logger('PaymentService');

    constructor(
        @Inject(NATS_SERVICE) private readonly client: ClientProxy
    ) { }

    async createPaymentSession(paymentSessionDto: PaymentSessionDto) {
        const { currency, items, orderId } = paymentSessionDto;

        const lineItems = items.map((item) => {
            return {
                price_data: {
                    currency: currency,
                    product_data: {
                        name: item.name
                    },
                    unit_amount: Math.round(item.price * 100), // 20 dollars
                },
                quantity: item.quantity
            }
        })

        const session = await this.stripe.checkout.sessions.create({
            // Set my order ID here
            payment_intent_data: {
                metadata: {
                    orderId
                }
            },
            line_items: lineItems,
            mode: 'payment',
            success_url: envs.stripeSuccessUrl,
            cancel_url: envs.stripeCancelUrl
        });

        // return session;
        return {
            cancelUrl: session.cancel_url,
            successUrl: session.success_url,
            url: session.url
        }
    }

    async stripeWebhook(req: Request, res: Response) {
        const sig = req.headers['stripe-signature'];

        if (!sig) {
            return res.status(400).send('Webhook Error: Missing stripe-signature header');
        }

        let event: Stripe.Event;

        // Testing
        // const endpointSecret = 'whsec_5315cbe49b257bab021a8b5495b912457b56a9f9c8ff452b2f3e532b31602945';

        const endpointSecret = envs.stripeEndpointSecret;


        try {
            event = this.stripe.webhooks.constructEvent(
                req['rawBody'],
                sig,
                endpointSecret
            );

        } catch (err) {
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }

        switch (event.type) {
            case 'charge.succeeded':
                const chargeSucceeded = event.data.object;

                const payload = {
                    stripePaymentId: chargeSucceeded.id,
                    orderId: chargeSucceeded.metadata.orderId,
                    receiptUrl: chargeSucceeded.receipt_url
                }

                // this.logger.log({ payload })
                this.client.emit('payment.succeeded', payload);

                break;

            default:
                console.log(`Event ${event} no handled`);
        }

        return res.status(200).json({ sig });
    }
}

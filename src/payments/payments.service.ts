import { Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { envs } from 'src/config';
import { PaymentSessionDto } from 'src/dto/payment-session.dto';
import Stripe from 'stripe';

@Injectable()
export class PaymentsService {
    private readonly stripe = new Stripe(envs.stripeSecret);

    async createPaymentSession(paymentSessionDto: PaymentSessionDto) {
        const { currency, items } = paymentSessionDto;

        const lineItems = items.map((item: { name: string; price: number; quantity: number }) => {
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
            // Set my ID order here
            payment_intent_data: {
                metadata: {}
            },
            line_items: lineItems,
            mode: 'payment',
            success_url: 'http://localhost:3003/payments/success',
            cancel_url: 'http://localhost:3003/payments/cancelled'
        });

        return session;
    }

    async stripeWebhook(req: Request, res: Response) {
        const sig = req.headers['stripe-signature'];

        return res.status(200).json({ sig })
    }
}

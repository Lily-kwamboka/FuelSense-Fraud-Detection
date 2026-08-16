import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

export class MafutaFlowAfricaContainer extends Container {
    defaultPort = 3001;
    sleepAfter = "60m";

    envVars = {
        ALERT_EMAIL: env.ALERT_EMAIL,
        ALERT_FROM_EMAIL: env.ALERT_FROM_EMAIL,
        ALERT_PHONE_NUMBER: env.ALERT_PHONE_NUMBER,
        ALERT_TO_EMAIL: env.ALERT_TO_EMAIL,
        API_BASE_URL: env.API_BASE_URL,
        API_PORT: env.API_PORT,
        AT_API_KEY: env.AT_API_KEY,
        AT_SENDER_ID: env.AT_SENDER_ID,
        AT_USERNAME: env.AT_USERNAME,
        DATABASE_URL: env.DATABASE_URL,
        FRONTEND_URL: env.FRONTEND_URL,
        GMAIL_APP_PASSWORD: env.GMAIL_APP_PASSWORD,
        GMAIL_USER: env.GMAIL_USER,
        MAX_PAYMENT_AMOUNT: env.MAX_PAYMENT_AMOUNT,
        NODE_ENV: env.NODE_ENV,
        PESAPAL_CONSUMER_KEY: env.PESAPAL_CONSUMER_KEY,
        PESAPAL_CONSUMER_SECRET: env.PESAPAL_CONSUMER_SECRET,
        PESAPAL_ENV: env.PESAPAL_ENV,
        RESEND_API_KEY: env.RESEND_API_KEY,
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_URL: env.SUPABASE_URL,
        USE_ATG_SIMULATOR: env.USE_ATG_SIMULATOR,
        PORT: env.API_PORT,
    };

    onStart() {
        console.log("Container started successfully");
    }

    onError(error) {
        console.log("Container error:", error);
    }
}

export default {
    async fetch(request, env) {
        const container = getContainer(env.MAFUTAFLOW_CONTAINER, "main");
        return container.fetch(request);
    },
};
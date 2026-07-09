import {
  StandardCheckoutClient,
  StandardCheckoutPayRequest,
  Env,
} from "@phonepe-pg/pg-sdk-node";

let client;

export const getPhonePeClient = () => {
  if (!client) {
    const clientId = process.env.PHONEPE_CLIENT_ID;
    const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
    const clientVersion = Number(process.env.PHONEPE_CLIENT_VERSION || 1);
    const env =
      process.env.PHONEPE_ENV === "PRODUCTION" ? Env.PRODUCTION : Env.SANDBOX;
    client = StandardCheckoutClient.getInstance(
      clientId,
      clientSecret,
      clientVersion,
      env,
    );
  }
  return client;
};

export const createPhonePeOrder = ({
  merchantOrderId,
  amountPaise,
  redirectUrl,
}) => {
  const request = StandardCheckoutPayRequest.builder()
    .merchantOrderId(merchantOrderId)
    .amount(amountPaise)
    .redirectUrl(redirectUrl)
    .build();
  return getPhonePeClient().pay(request);
};

export const getPhonePeOrderStatus = (merchantOrderId) =>
  getPhonePeClient().getOrderStatus(merchantOrderId);

export const validatePhonePeCallback = (authorizationHeader, rawBody) =>
  getPhonePeClient().validateCallback(
    process.env.PHONEPE_CALLBACK_USERNAME,
    process.env.PHONEPE_CALLBACK_PASSWORD,
    authorizationHeader,
    rawBody,
  );

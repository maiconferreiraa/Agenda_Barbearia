import { MercadoPagoConfig, PreApproval, Payment } from 'mercadopago'
import { MP_ACCESS_TOKEN } from './params'

let client: MercadoPagoConfig | null = null

function getClient() {
  if (!client) {
    client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN.value() })
  }
  return client
}

export function preApprovalApi() {
  return new PreApproval(getClient())
}

export function paymentApi() {
  return new Payment(getClient())
}

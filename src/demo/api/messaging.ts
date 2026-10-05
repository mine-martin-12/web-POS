import type { Audience, MessagingApi, SmsMessage, SmsTemplate } from "@/features/messaging/api";
import { asActor, callRpc, rows } from "../db/engine";
import * as edge from "../simulate/edge";

export const messaging = {
  fetchMessages(sinceIso: string) {
    return asActor((tx) =>
      rows<SmsMessage>(tx, "SELECT * FROM public.sms_messages WHERE created_at >= $1 ORDER BY created_at DESC, id", [sinceIso]),
    );
  },

  fetchTemplates() {
    return asActor((tx) => rows<SmsTemplate>(tx, "SELECT * FROM public.sms_templates ORDER BY name"));
  },

  async saveTemplate(input: { id?: string; name: string; body: string }) {
    await asActor((tx) =>
      input.id
        ? rows(tx, "UPDATE public.sms_templates SET name = $2, body = $3 WHERE id = $1", [input.id, input.name, input.body])
        : rows(tx, "INSERT INTO public.sms_templates (name, body) VALUES ($1, $2)", [input.name, input.body]),
    );
  },

  async deleteTemplate(id: string) {
    await asActor((tx) => rows(tx, "DELETE FROM public.sms_templates WHERE id = $1", [id]));
  },

  fetchAudience(audience: Audience) {
    return asActor((tx) =>
      callRpc<Array<{ customer_id: string; name: string }>>(tx, "sms_audience", { _audience: audience }, "rows"),
    );
  },

  sendSms: (input: { customerIds: string[]; message: string; broadcast?: boolean }) => edge.sendSms(input),
  retrySms: (messageIds: string[]) => edge.retrySms(messageIds),
  sendOverdueReminders: (message: string) => edge.sendOverdueReminders(message),
} satisfies MessagingApi;

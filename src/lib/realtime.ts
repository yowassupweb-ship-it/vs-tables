import { EventEmitter } from "events";
import { getRedisPair } from "@/lib/redis";

const CHANNEL = "desk_updates";
const emitter = new EventEmitter();

const globalForRealtime = globalThis as typeof globalThis & {
  redisSubscribed?: boolean;
};

export type DeskEventPayload = {
  type: "desk-updated";
  deskId: string;
  actorName: string;
  active: boolean;
  at: string;
};

export async function ensureRealtimeSubscription() {
  if (globalForRealtime.redisSubscribed) {
    return;
  }

  const { subscriber } = await getRedisPair();

  if (!subscriber) {
    globalForRealtime.redisSubscribed = true;
    return;
  }

  await subscriber.subscribe(CHANNEL, (rawMessage) => {
    emitter.emit("message", rawMessage);
  });

  globalForRealtime.redisSubscribed = true;
}

export async function publishDeskEvent(payload: DeskEventPayload) {
  const raw = JSON.stringify(payload);
  emitter.emit("message", raw);

  const { publisher } = await getRedisPair();
  if (publisher) {
    await publisher.publish(CHANNEL, raw);
  }
}

export function onRealtimeMessage(listener: (rawMessage: string) => void) {
  emitter.on("message", listener);
  return () => {
    emitter.off("message", listener);
  };
}

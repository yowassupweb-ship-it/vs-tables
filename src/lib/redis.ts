import { createClient } from "redis";

type AnyRedisClient = ReturnType<typeof createClient>;

type RedisPair = {
  publisher: AnyRedisClient | null;
  subscriber: AnyRedisClient | null;
};

const globalForRedis = globalThis as typeof globalThis & {
  redisPair?: RedisPair;
  redisInitialized?: Promise<RedisPair>;
};

async function connectRedis(): Promise<RedisPair> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return { publisher: null, subscriber: null };
  }

  const publisher = createClient({ url: redisUrl });
  const subscriber = publisher.duplicate();

  publisher.on("error", (error) => {
    console.error("Redis publisher error", error);
  });

  subscriber.on("error", (error) => {
    console.error("Redis subscriber error", error);
  });

  await publisher.connect();
  await subscriber.connect();

  return { publisher, subscriber };
}

export async function getRedisPair(): Promise<RedisPair> {
  if (globalForRedis.redisPair) {
    return globalForRedis.redisPair;
  }

  if (!globalForRedis.redisInitialized) {
    globalForRedis.redisInitialized = connectRedis().then((pair) => {
      globalForRedis.redisPair = pair;
      return pair;
    });
  }

  return globalForRedis.redisInitialized;
}

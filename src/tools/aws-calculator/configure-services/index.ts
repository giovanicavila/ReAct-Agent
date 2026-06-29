import type { Page } from "playwright";

type Configurator = (page: Page) => Promise<void>;

const registry: Record<string, Configurator> = {};

export function register(name: string, fn: Configurator) {
  registry[name] = fn;
}

export async function configureService(page: Page, serviceName: string): Promise<void> {
  const fn = registry[serviceName];
  if (fn) {
    await fn(page);
  }
}

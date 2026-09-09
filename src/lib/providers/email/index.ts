import type { EmailMessage, EmailProvider } from "./types";

/** Development provider: prints the message (links included) to the server log. */
class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.info(`[email] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}

let provider: EmailProvider | null = null;

export function emailProvider(): EmailProvider {
  if (!provider) provider = new ConsoleEmailProvider();
  return provider;
}

export function setEmailProviderForTests(p: EmailProvider | null): void {
  provider = p;
}

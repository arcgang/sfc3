export interface EmailServiceClient {
  sendPasswordResetInstructions(email: string): Promise<void>;
}

export function buildEmailServiceClient(): EmailServiceClient {
  return {
    async sendPasswordResetInstructions(email: string): Promise<void> {
      console.log({
        event: "email.password_reset_instructions_dispatched",
        recipient: email,
      });
    },
  };
}

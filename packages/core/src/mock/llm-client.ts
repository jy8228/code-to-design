import Anthropic from '@anthropic-ai/sdk';

export interface LlmResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Simple LLM client wrapper for Anthropic Claude API.
 */
export class LlmClient {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<LlmResponse> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find(block => block.type === 'text');
    const content = textBlock ? textBlock.text : '';

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

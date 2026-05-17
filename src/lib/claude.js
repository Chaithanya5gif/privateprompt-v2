/**
 * PrivatePrompt V2 — Claude API Integration
 * Sends anonymized prompts to Claude and returns AI responses.
 */

const SYSTEM_PROMPT = `You are a highly capable, helpful AI assistant. 

CRITICAL INSTRUCTION: The user's messages may contain bracketed tokens like [NAME_1], [FINANCIAL_1], [MEDICAL_1], [SSN_1], etc. These are privacy-preserving placeholders that replaced real sensitive data. 

Your rules:
1. NEVER attempt to guess, infer, or fill in what the real values behind tokens might be.
2. Use the SAME token format in your response when referring back to those entities. For example: "Based on [NAME_1]'s situation with [MEDICAL_1]..."
3. Provide genuinely helpful, substantive answers using the tokenized context.
4. Treat tokens as opaque identifiers — real names, real conditions, just anonymized.
5. Be natural and conversational. The user will see de-tokenized text.`;

/**
 * Send a message to Claude API
 * @param {Array} conversationHistory - Array of {role, content} objects
 * @param {string} apiKey - Anthropic API key
 * @returns {Promise<string>} AI response text
 */
export async function sendToClaude(conversationHistory, apiKey) {
  if (!apiKey) {
    throw new Error('Claude API key is required. Please add it in settings.');
  }

  if (apiKey === 'mock') {
    return new Promise(resolve => setTimeout(() => resolve(
      "Yes, based on the information provided, [NAME_1] would be eligible for this health plan even with a pre-existing condition like [MEDICAL_1], and the plan provides solid coverage for individuals with an income of [FINANCIAL_1]."
    ), 1500));
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: conversationHistory,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`Claude API error: ${error?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

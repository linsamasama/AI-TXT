const axios = require('axios');
require('./env');

const SILICONFLOW_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

function normalizeMessageContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') {
          return item;
        }
        if (item && typeof item === 'object') {
          return item.text || item.content || '';
        }
        return '';
      })
      .join('');
  }

  if (content && typeof content === 'object') {
    return content.text || content.content || '';
  }

  return '';
}

function resolveProvider(model = '') {
  const normalizedModel = String(model || '').trim().toLowerCase();

  if (normalizedModel.startsWith('glm-')) {
    return 'zhipu';
  }

  return 'siliconflow';
}

function getProviderConfig(model) {
  const provider = resolveProvider(model);

  if (provider === 'zhipu') {
    const apiKey = process.env.ZHIPU_API_KEY || process.env.BIGMODEL_API_KEY || process.env.ZHIPUAI_API_KEY || '';

    if (!apiKey) {
      throw new Error('未配置智谱 API Key，请设置 ZHIPU_API_KEY 或 BIGMODEL_API_KEY 环境变量');
    }

    return {
      provider,
      apiUrl: ZHIPU_API_URL,
      apiKey,
      extraBody: {
        thinking: {
          type: 'disabled'
        }
      }
    };
  }

  return {
    provider,
    apiUrl: SILICONFLOW_API_URL,
    apiKey: process.env.SILICONFLOW_API_KEY || '',
    extraBody: {}
  };
}

function buildRequestBody(model, messages, options = {}) {
  const { provider, extraBody } = getProviderConfig(model);
  const body = {
    model,
    messages,
    ...extraBody
  };

  if (typeof options.maxTokens === 'number' && Number.isFinite(options.maxTokens)) {
    body.max_tokens = Math.max(1, Math.floor(options.maxTokens));
  }

  if (typeof options.temperature === 'number') {
    body.temperature = options.temperature;
  }

  if (typeof options.stream === 'boolean') {
    body.stream = options.stream;
  }

  if (options.extraBody && typeof options.extraBody === 'object') {
    Object.assign(body, options.extraBody);
  }

  return { provider, body };
}

async function requestChatCompletion({ model, messages, maxTokens, temperature, stream = false, timeout, extraBody, extraHeaders } = {}) {
  const providerConfig = getProviderConfig(model);

  if (!providerConfig.apiKey) {
    throw new Error('未配置 SiliconFlow API Key，请设置 SILICONFLOW_API_KEY 环境变量');
  }

  const { body } = buildRequestBody(model, messages, {
    maxTokens,
    temperature,
    stream,
    extraBody
  });

  const headers = {
    Authorization: `Bearer ${providerConfig.apiKey}`,
    'Content-Type': 'application/json',
    ...(stream ? { Accept: 'text/event-stream' } : {}),
    ...(extraHeaders || {})
  };

  const requestConfig = {
    headers
  };

  if (timeout) {
    requestConfig.timeout = timeout;
  }

  if (stream) {
    requestConfig.responseType = 'stream';
    requestConfig.adapter = 'http';
  }

  try {
    return await axios.post(providerConfig.apiUrl, body, requestConfig);
  } catch (error) {
    const responseData = error.response?.data;
    const upstreamMessage =
      responseData?.message ||
      responseData?.error?.message ||
      responseData?.error ||
      error.message;
    const status = error.response?.status;

    if (status === 403 && upstreamMessage) {
      error.message = `模型不可用：${upstreamMessage}`;
    } else if (upstreamMessage) {
      error.message = upstreamMessage;
    }

    error.providerStatus = status || null;
    error.providerCode = responseData?.code || responseData?.error?.code || '';
    error.providerTraceId = error.response?.headers?.['x-siliconcloud-trace-id'] || '';
    throw error;
  }
}

function extractMessageContent(response) {
  return normalizeMessageContent(response?.data?.choices?.[0]?.message?.content).trim();
}

function extractCompletionMeta(response) {
  return {
    traceId: response?.headers?.['x-siliconcloud-trace-id'] || '',
    finishReason: response?.data?.choices?.[0]?.finish_reason || '',
    usageTotalTokens: response?.data?.usage?.total_tokens || 0,
    hasReasoningContent: Boolean(response?.data?.choices?.[0]?.message?.reasoning_content)
  };
}

function extractStreamDelta(parsedChunk) {
  return normalizeMessageContent(parsedChunk?.choices?.[0]?.delta?.content);
}

module.exports = {
  requestChatCompletion,
  extractMessageContent,
  extractCompletionMeta,
  extractStreamDelta,
  normalizeMessageContent,
  resolveProvider
};

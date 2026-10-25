import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelForModel, modelOptions, resolveFytModel, isModelMapped } from '../lib/fyt/model-alias.mjs';

test('labelForModel returns a readable name and falls back to the raw id', () => {
  assert.equal(labelForModel('gpt-image-2.5-flare'), 'GPT Image 2.5 Flare');
  assert.equal(labelForModel('seedance-2.5'), 'Seedance 2.5');
  assert.equal(labelForModel(' gpt-image-2 '), 'GPT Image 2');
  // 未收录的模型不做猜测，原样返回
  assert.equal(labelForModel('some-new-model-2030'), 'some-new-model-2030');
  assert.equal(labelForModel(''), '');
  assert.equal(labelForModel(null), '');
});

test('modelOptions keeps fyt ids as values, deduplicates and preserves order', () => {
  const options = modelOptions(['gpt-image-2', ' seedance-2.5 ', 'gpt-image-2', '', 42, 'unknown-x']);
  assert.deepEqual(options, [
    { value: 'gpt-image-2', label: 'GPT Image 2' },
    { value: 'seedance-2.5', label: 'Seedance 2.5' },
    { value: 'unknown-x', label: 'unknown-x' },
  ]);
  assert.deepEqual(modelOptions(null), []);
});

test('resolveFytModel maps upstream ids onto models the group actually has', () => {
  const available = ['gpt-image-2', 'gemini-nano-banana-2.1', 'seedance-2.5'];
  // 按候选顺序取第一个可用项
  assert.equal(resolveFytModel('gpt-image-1', ['gpt-image-2.5-flare', 'gpt-image-2']), 'gpt-image-2');
  assert.equal(resolveFytModel('gpt-image-1', available), 'gpt-image-2');
  assert.equal(resolveFytModel('nano-banana', available), 'gemini-nano-banana-2.1');
  // 没有别名时按同名解析
  assert.equal(resolveFytModel('seedance-2.5', available), 'seedance-2.5');
  // 解析不到返回 null，调用方据此禁用生成
  assert.equal(resolveFytModel('flux-1.1-pro', available), null);
  assert.equal(resolveFytModel('gpt-image-1', []), null);
  assert.equal(resolveFytModel('', available), null);
  assert.equal(resolveFytModel('gpt-image-1', undefined), null);
});

test('isModelMapped mirrors resolveFytModel', () => {
  assert.equal(isModelMapped('nano-banana', ['gemini-nano-banana-2.1']), true);
  assert.equal(isModelMapped('flux-1.1-pro', ['gemini-nano-banana-2.1']), false);
});

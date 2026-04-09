import { describe, test, expect } from '@jest/globals';

/**
 * Excel SPU Import/Export — validates row-level validation logic for
 * the new image_urls and spec_attributes columns.
 *
 * We extract and test the validation rules directly rather than going through
 * the full import pipeline (which requires DB + ExcelJS file creation).
 */

// Replicate the validation logic extracted from excel.js validateRowByType for SPU
function validateSpuRow(data) {
  const errors = [];
  if (data.status && !['draft', 'published', 'unpublished', 'archived'].includes(data.status)) {
    errors.push({ field: 'status', message: 'Status must be draft, published, unpublished, or archived' });
  }
  if (data.image_urls) {
    const urls = data.image_urls.split('|').map(u => u.trim()).filter(Boolean);
    for (const url of urls) {
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
        errors.push({ field: 'image_urls', message: `Invalid image URL: "${url}" (must start with http://, https://, or /)` });
        break;
      }
    }
  }
  if (data.spec_attributes) {
    try {
      const parsed = JSON.parse(data.spec_attributes);
      if (!Array.isArray(parsed)) {
        errors.push({ field: 'spec_attributes', message: 'Spec Attributes must be a JSON array' });
      } else {
        for (const spec of parsed) {
          if (!spec.name || !Array.isArray(spec.values)) {
            errors.push({ field: 'spec_attributes', message: 'Each spec attribute must have "name" (string) and "values" (array)' });
            break;
          }
        }
      }
    } catch {
      errors.push({ field: 'spec_attributes', message: 'Spec Attributes must be valid JSON' });
    }
  }
  return errors;
}

describe('SPU Excel Import — Image URL Validation', () => {

  test('accepts valid http URLs', () => {
    const errors = validateSpuRow({ image_urls: 'http://example.com/img1.jpg|http://example.com/img2.png' });
    expect(errors).toEqual([]);
  });

  test('accepts valid https URLs', () => {
    const errors = validateSpuRow({ image_urls: 'https://cdn.example.com/product.jpg' });
    expect(errors).toEqual([]);
  });

  test('accepts relative paths starting with /', () => {
    const errors = validateSpuRow({ image_urls: '/images/product-a.jpg|/images/product-b.png' });
    expect(errors).toEqual([]);
  });

  test('rejects invalid URLs', () => {
    const errors = validateSpuRow({ image_urls: 'not-a-url' });
    expect(errors.length).toBe(1);
    expect(errors[0].field).toBe('image_urls');
    expect(errors[0].message).toContain('Invalid image URL');
  });

  test('rejects mixed valid/invalid URLs (first invalid stops)', () => {
    const errors = validateSpuRow({ image_urls: 'https://ok.com/a.jpg|badurl|https://ok.com/b.jpg' });
    expect(errors.length).toBe(1);
    expect(errors[0].field).toBe('image_urls');
  });

  test('accepts empty image_urls', () => {
    const errors = validateSpuRow({ image_urls: '' });
    expect(errors).toEqual([]);
  });

  test('accepts missing image_urls', () => {
    const errors = validateSpuRow({});
    expect(errors).toEqual([]);
  });

  test('handles pipe-separated with whitespace', () => {
    const errors = validateSpuRow({ image_urls: ' https://a.com/1.jpg | https://b.com/2.jpg ' });
    expect(errors).toEqual([]);
  });
});

describe('SPU Excel Import — Spec Attributes Validation', () => {

  test('accepts valid spec attributes JSON', () => {
    const specs = JSON.stringify([
      { name: 'Color', values: ['Red', 'Blue'] },
      { name: 'Weight', values: ['100g', '200g'] },
    ]);
    const errors = validateSpuRow({ spec_attributes: specs });
    expect(errors).toEqual([]);
  });

  test('rejects invalid JSON', () => {
    const errors = validateSpuRow({ spec_attributes: 'not json' });
    expect(errors.length).toBe(1);
    expect(errors[0].field).toBe('spec_attributes');
    expect(errors[0].message).toContain('valid JSON');
  });

  test('rejects non-array JSON', () => {
    const errors = validateSpuRow({ spec_attributes: '{"name":"Color"}' });
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('JSON array');
  });

  test('rejects spec without name', () => {
    const specs = JSON.stringify([{ values: ['Red'] }]);
    const errors = validateSpuRow({ spec_attributes: specs });
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('"name"');
  });

  test('rejects spec without values array', () => {
    const specs = JSON.stringify([{ name: 'Color', values: 'Red' }]);
    const errors = validateSpuRow({ spec_attributes: specs });
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain('"values"');
  });

  test('accepts empty array', () => {
    const errors = validateSpuRow({ spec_attributes: '[]' });
    expect(errors).toEqual([]);
  });

  test('accepts missing spec_attributes', () => {
    const errors = validateSpuRow({});
    expect(errors).toEqual([]);
  });

  test('accepts empty string spec_attributes', () => {
    const errors = validateSpuRow({ spec_attributes: '' });
    expect(errors).toEqual([]);
  });
});

describe('SPU Excel — Combined Validation', () => {

  test('valid row with all fields passes', () => {
    const errors = validateSpuRow({
      name: 'Test Product',
      category_slug: 'antibiotics',
      status: 'published',
      image_urls: 'https://cdn.example.com/img1.jpg|https://cdn.example.com/img2.jpg',
      spec_attributes: JSON.stringify([
        { name: 'Dosage', values: ['50mg', '100mg'] },
      ]),
    });
    expect(errors).toEqual([]);
  });

  test('multiple validation errors are collected', () => {
    const errors = validateSpuRow({
      status: 'invalid_status',
      image_urls: 'bad-url',
      spec_attributes: 'not json',
    });
    expect(errors.length).toBe(3);
    const fields = errors.map(e => e.field);
    expect(fields).toContain('status');
    expect(fields).toContain('image_urls');
    expect(fields).toContain('spec_attributes');
  });
});

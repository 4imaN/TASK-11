import { describe, test, expect, beforeAll } from '@jest/globals';
import { loginAsAdmin, loginAsBuyer, loginAsDispatcher, clearSession, apiRequest } from './helpers.js';

describe('Catalog API', () => {
  beforeAll(async () => {
    await loginAsAdmin();
  });

  test('list SPUs returns paginated data', async () => {
    const res = await apiRequest('GET', '/api/spus?limit=10');
    expect(res.status).toBe(200);
    expect(res.data.data).toHaveProperty('items');
    expect(res.data.data).toHaveProperty('total');
  });

  test('get SPU detail includes SKUs and images', async () => {
    const list = await apiRequest('GET', '/api/spus?limit=1');
    const spuId = list.data.data.items[0]?.id;
    expect(spuId).toBeTruthy();

    const res = await apiRequest('GET', `/api/spus/${spuId}`);
    expect(res.status).toBe(200);
    expect(res.data.data).toHaveProperty('skus');
    expect(res.data.data).toHaveProperty('images');
    expect(res.data.data).toHaveProperty('spec_attributes');
    expect(res.data.data).toHaveProperty('tags');
  });

  test('create SPU as admin', async () => {
    const res = await apiRequest('POST', '/api/spus', {
      name: 'Test Product',
      description: 'Test description',
      category_id: 'f0000000-0000-0000-0000-000000000001',
      spec_attributes: [{ name: 'size', values: ['small', 'medium'] }],
    });
    expect(res.status).toBe(201);
    expect(res.data.data.name).toBe('Test Product');
  });

  test('publish and unpublish SPU', async () => {
    const list = await apiRequest('GET', '/api/spus?status=draft&limit=1');
    const spuId = list.data.data.items[0]?.id;
    expect(spuId).toBeTruthy();

    const pub = await apiRequest('PATCH', `/api/spus/${spuId}/status`, { status: 'published' });
    expect(pub.status).toBe(200);
    expect(pub.data.data.status).toBe('published');

    const unpub = await apiRequest('PATCH', `/api/spus/${spuId}/status`, { status: 'unpublished' });
    expect(unpub.status).toBe(200);
    expect(unpub.data.data.status).toBe('unpublished');
  });

  test('list categories as tree', async () => {
    const res = await apiRequest('GET', '/api/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('list tags', async () => {
    const res = await apiRequest('GET', '/api/tags');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('create SKU for SPU', async () => {
    const list = await apiRequest('GET', '/api/spus?limit=1');
    const spuId = list.data.data.items[0]?.id;
    expect(spuId).toBeTruthy();

    const res = await apiRequest('POST', `/api/spus/${spuId}/skus`, {
      sku_code: `TEST-SKU-${Date.now()}`,
      spec_combination: { strength: '50mg' },
    });
    expect(res.status).toBe(201);
  });

  test('buyer cannot create products (role enforcement)', async () => {
    clearSession();
    await loginAsBuyer();
    const res = await apiRequest('POST', '/api/spus', { name: 'Unauthorized Product' });
    expect(res.status).toBe(403);
  });

  test('dispatcher cannot access SPU list', async () => {
    clearSession();
    await loginAsDispatcher();
    const res = await apiRequest('GET', '/api/spus');
    expect(res.status).toBe(403);
  });

  test('dispatcher cannot access SPU detail', async () => {
    const res = await apiRequest('GET', '/api/spus/13000000-0000-0000-0000-000000000001');
    expect(res.status).toBe(403);
  });

  test('dispatcher cannot access SKU list', async () => {
    const res = await apiRequest('GET', '/api/spus/13000000-0000-0000-0000-000000000001/skus');
    expect(res.status).toBe(403);
  });

  // ── Section 2: SPU lifecycle editing tests ──

  test('update SPU tags via PUT', async () => {
    clearSession();
    await loginAsAdmin();

    // Get a tag ID
    const tagsRes = await apiRequest('GET', '/api/tags');
    expect(tagsRes.status).toBe(200);
    const tagIds = tagsRes.data.data.slice(0, 2).map(t => t.id);

    // Get an SPU
    const list = await apiRequest('GET', '/api/spus?limit=1');
    const spuId = list.data.data.items[0]?.id;
    expect(spuId).toBeTruthy();

    // Update with tags
    const res = await apiRequest('PUT', `/api/spus/${spuId}`, { tags: tagIds });
    expect(res.status).toBe(200);

    // Verify tags were saved
    const detail = await apiRequest('GET', `/api/spus/${spuId}`);
    expect(detail.status).toBe(200);
    const savedTagIds = detail.data.data.tags.map(t => t.id);
    for (const id of tagIds) {
      expect(savedTagIds).toContain(id);
    }
  });

  test('update SPU spec attributes via PUT', async () => {
    clearSession();
    await loginAsAdmin();

    const list = await apiRequest('GET', '/api/spus?limit=1');
    const spuId = list.data.data.items[0]?.id;

    const specs = [
      { name: 'strength', values: ['100mg', '250mg'] },
      { name: 'flavor', values: ['vanilla', 'chocolate'] },
    ];
    const res = await apiRequest('PUT', `/api/spus/${spuId}`, { spec_attributes: specs });
    expect(res.status).toBe(200);

    const detail = await apiRequest('GET', `/api/spus/${spuId}`);
    expect(detail.data.data.spec_attributes.length).toBe(2);
    expect(detail.data.data.spec_attributes.map(s => s.name)).toContain('strength');
    expect(detail.data.data.spec_attributes.map(s => s.name)).toContain('flavor');
  });

  test('update SPU category via PUT', async () => {
    clearSession();
    await loginAsAdmin();

    const cats = await apiRequest('GET', '/api/categories?flat=true');
    const catId = cats.data.data[0]?.id;
    expect(catId).toBeTruthy();

    const list = await apiRequest('GET', '/api/spus?limit=1');
    const spuId = list.data.data.items[0]?.id;

    const res = await apiRequest('PUT', `/api/spus/${spuId}`, { category_id: catId });
    expect(res.status).toBe(200);

    const detail = await apiRequest('GET', `/api/spus/${spuId}`);
    expect(detail.data.data.category_id).toBe(catId);
  });

  test('update SKU spec_combination via PUT', async () => {
    clearSession();
    await loginAsAdmin();

    // Create a test SKU
    const list = await apiRequest('GET', '/api/spus?limit=1');
    const spuId = list.data.data.items[0]?.id;
    const skuCode = `EDIT-SKU-${Date.now()}`;
    const createRes = await apiRequest('POST', `/api/spus/${spuId}/skus`, {
      sku_code: skuCode,
      spec_combination: { size: 'small' },
    });
    expect(createRes.status).toBe(201);
    const skuId = createRes.data.data.id;

    // Update spec_combination
    const updateRes = await apiRequest('PUT', `/api/skus/${skuId}`, {
      spec_combination: { size: 'large', color: 'blue' },
    });
    expect(updateRes.status).toBe(200);
    expect(updateRes.data.data.spec_combination).toEqual({ size: 'large', color: 'blue' });
  });

  test('change SKU status via PATCH', async () => {
    clearSession();
    await loginAsAdmin();

    const list = await apiRequest('GET', '/api/spus?limit=1');
    const spuId = list.data.data.items[0]?.id;
    const skuCode = `STATUS-SKU-${Date.now()}`;
    const createRes = await apiRequest('POST', `/api/spus/${spuId}/skus`, {
      sku_code: skuCode,
    });
    expect(createRes.status).toBe(201);
    const skuId = createRes.data.data.id;
    expect(createRes.data.data.status).toBe('draft');

    // Publish
    const pubRes = await apiRequest('PATCH', `/api/skus/${skuId}/status`, { status: 'published' });
    expect(pubRes.status).toBe(200);
    expect(pubRes.data.data.status).toBe('published');

    // Unpublish
    const unpubRes = await apiRequest('PATCH', `/api/skus/${skuId}/status`, { status: 'unpublished' });
    expect(unpubRes.status).toBe(200);
    expect(unpubRes.data.data.status).toBe('unpublished');
  });

  test('buyer cannot update SPU or SKU (role enforcement)', async () => {
    clearSession();
    await loginAsBuyer();
    const res = await apiRequest('PUT', '/api/spus/13000000-0000-0000-0000-000000000001', { name: 'Hacked' });
    expect(res.status).toBe(403);

    const skuRes = await apiRequest('PUT', '/api/skus/14000000-0000-0000-0000-000000000001', { status: 'archived' });
    expect(skuRes.status).toBe(403);
  });
});

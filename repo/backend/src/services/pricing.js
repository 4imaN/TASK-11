import { query } from '../db/pool.js';
import { Errors } from '../utils/errors.js';

export function validateMOQAndPackSize(quantity, moq, packSize) {
  const errors = [];
  if (quantity < moq) {
    errors.push(`Quantity ${quantity} is below minimum order quantity of ${moq}`);
  }
  if (packSize > 1 && quantity % packSize !== 0) {
    errors.push(`Quantity ${quantity} must be a multiple of pack size ${packSize}`);
  }
  return errors;
}

export async function getPreferredSupplier(skuId, supplierIdOverride) {
  if (supplierIdOverride) {
    const result = await query(
      `SELECT ss.* FROM sku_suppliers ss
       JOIN suppliers s ON s.id = ss.supplier_id
       WHERE ss.sku_id = $1 AND ss.supplier_id = $2 AND ss.is_active = true AND s.status = 'active'`,
      [skuId, supplierIdOverride]
    );
    if (result.rows.length === 0) throw Errors.notFound('Active SKU-Supplier pricing for override');
    return result.rows[0];
  }

  const result = await query(
    `SELECT ss.* FROM sku_suppliers ss
     JOIN suppliers s ON s.id = ss.supplier_id
     WHERE ss.sku_id = $1 AND ss.is_active = true AND s.status = 'active'
     ORDER BY ss.is_preferred DESC, ss.unit_price ASC LIMIT 1`,
    [skuId]
  );
  if (result.rows.length === 0) throw Errors.notFound('Active SKU-Supplier pricing');
  return result.rows[0];
}

export async function computeEstimate(cartItems, storeId) {
  const configResult = await query(
    "SELECT key, value FROM system_config WHERE key IN ('handling_fee', 'tax_rules')"
  );
  const config = {};
  for (const row of configResult.rows) {
    config[row.key] = row.value;
  }

  const handlingFeeConfig = config.handling_fee || { type: 'flat', amount: 5.00, per: 'supplier_split' };
  const taxConfig = config.tax_rules || { default_rate: 0.08, rules: [] };

  let storeCode = null;
  if (storeId) {
    const storeResult = await query('SELECT code FROM stores WHERE id = $1', [storeId]);
    if (storeResult.rows.length > 0) storeCode = storeResult.rows[0].code;
  }

  const taxRate = getTaxRateForStore(taxConfig, storeCode);

  const lines = [];
  for (const item of cartItems) {
    const pricing = await getPreferredSupplier(item.sku_id, item.supplier_id);

    const moqErrors = validateMOQAndPackSize(item.quantity, pricing.moq, pricing.pack_size);
    if (moqErrors.length > 0) {
      throw Errors.validation('MOQ/pack-size violation', { sku_id: item.sku_id, errors: moqErrors });
    }

    lines.push({
      cart_item_id: item.id,
      sku_id: item.sku_id,
      supplier_id: pricing.supplier_id,
      quantity: item.quantity,
      unit_price: parseFloat(pricing.unit_price),
      line_total: item.quantity * parseFloat(pricing.unit_price),
      is_taxable: pricing.is_taxable,
      moq: pricing.moq,
      pack_size: pricing.pack_size,
    });
  }

  const splits = {};
  for (const line of lines) {
    if (!splits[line.supplier_id]) {
      splits[line.supplier_id] = { supplier_id: line.supplier_id, lines: [], subtotal: 0, taxable_base: 0 };
    }
    splits[line.supplier_id].lines.push(line);
    splits[line.supplier_id].subtotal += line.line_total;
    if (line.is_taxable) {
      splits[line.supplier_id].taxable_base += line.line_total;
    }
  }

  const supplierSplits = [];
  let grandTotal = 0;
  let totalHandlingFee = 0;
  let totalTax = 0;

  for (const supplierId of Object.keys(splits)) {
    const split = splits[supplierId];

    const supplierResult = await query('SELECT name FROM suppliers WHERE id = $1', [supplierId]);
    const supplierName = supplierResult.rows[0]?.name || 'Unknown';

    let handlingFee = 0;
    if (handlingFeeConfig.per === 'supplier_split') {
      handlingFee = parseFloat(handlingFeeConfig.amount) || 0;
    }

    const tax = roundMoney(split.taxable_base * taxRate);
    const splitTotal = roundMoney(split.subtotal + handlingFee + tax);

    supplierSplits.push({
      supplier_id: supplierId,
      supplier_name: supplierName,
      lines: split.lines,
      subtotal: roundMoney(split.subtotal),
      handling_fee: handlingFee,
      taxable_base: roundMoney(split.taxable_base),
      tax_rate: taxRate,
      tax,
      total: splitTotal,
    });

    grandTotal += splitTotal;
    totalHandlingFee += handlingFee;
    totalTax += tax;
  }

  return {
    splits: supplierSplits,
    subtotal: roundMoney(lines.reduce((sum, l) => sum + l.line_total, 0)),
    handling_fee: roundMoney(totalHandlingFee),
    tax: roundMoney(totalTax),
    grand_total: roundMoney(grandTotal),
  };
}

function getTaxRateForStore(taxConfig, storeCode) {
  if (storeCode && taxConfig.rules) {
    const rule = taxConfig.rules.find(r => r.store_code === storeCode);
    if (rule) return rule.rate;
  }
  return taxConfig.default_rate || 0;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

export { roundMoney, getTaxRateForStore };

import test from 'node:test';
import assert from 'node:assert/strict';
import { mapMaterialRow, validateMaterialHeaders } from './material-master.mjs';

test('95-column mapping preserves IDs, source/reviewer fields, zero and repeated source links', () => {
  const headers = Array.from({ length: 95 }, (_, i) => `COL ${i}`);
  headers[47] = headers[48] = 'FILE LINK';
  const row = Array(95).fill(null);
  for (const [i, value] of [[0,1],[3,'source short'],[13,42131613],[19,'ADH'],[20,'00123'],[21,'hospital item'],[47,'first'],[48,'second'],[52,'reviewed short'],[82,0],[92,'Approved'],[93,46000]]) row[i] = value;
  const mapped = mapMaterialRow(row, headers);
  assert.equal(mapped.item_id, 'VMM-MS:1');
  assert.equal(mapped.mph_short, 'source short');
  assert.equal(mapped.new_short, 'reviewed short');
  assert.equal(mapped.hospital_code, '00123');
  assert.equal(mapped.hospital_name, 'ADH');
  assert.equal(mapped.hospital_desc, 'hospital item');
  assert.equal(mapped.unspsc_commodity, '42131613');
  assert.equal(mapped.status, 'Approved');
  assert.equal(mapped.review_date, '2025-12-09');
  assert.equal(mapped.mph_data['FILE LINK'], 'first');
  assert.equal(mapped.mph_data['FILE LINK (2)'], 'second');
  assert.equal(mapped.pasia_data['COL 82'], '0');
  assert.equal(mapMaterialRow([], headers), null);
});

test('rejects other workbook layouts before import', () => {
  assert.throws(() => validateMaterialHeaders(['ID', 'CATEGORY']), /column 3/);
});

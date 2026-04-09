-- PetMed Seed Data
-- Default password for all seed users: "password123"
-- bcrypt hash of "password123" with cost 12

-- Roles
INSERT INTO roles (id, name, description, permissions) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin', 'System Administrator', '["admin.*", "catalog.*", "inventory.*", "order.*", "task.*", "outcomes.*", "integration.*", "audit.*", "config.*", "user.*"]'),
('a0000000-0000-0000-0000-000000000002', 'buyer', 'Store Employee - Procurement', '["catalog.read", "cart.*", "order.create", "order.read.own", "hold.*", "inventory.read"]'),
('a0000000-0000-0000-0000-000000000003', 'dispatcher', 'Warehouse Fulfillment Staff', '["task.*", "order.read", "inventory.read"]'),
('a0000000-0000-0000-0000-000000000004', 'outcomes_reviewer', 'Outcomes Review Permission', '["outcomes.*", "projects.*", "evidence.*"]');

-- Users (password: password123 -> bcrypt hash)
INSERT INTO users (id, username, password_hash, display_name, email, status) VALUES
('b0000000-0000-0000-0000-000000000001', 'admin', '$2b$12$s1L9m9cOClNxK1VTEDLLqOI/q0DJeCr4VuJOvocoW39pttaYbgZbm', 'System Admin', 'admin@petmed.local', 'active'),
('b0000000-0000-0000-0000-000000000002', 'buyer1', '$2b$12$s1L9m9cOClNxK1VTEDLLqOI/q0DJeCr4VuJOvocoW39pttaYbgZbm', 'Jane Buyer', 'jane@petmed.local', 'active'),
('b0000000-0000-0000-0000-000000000003', 'dispatcher1', '$2b$12$s1L9m9cOClNxK1VTEDLLqOI/q0DJeCr4VuJOvocoW39pttaYbgZbm', 'Bob Dispatcher', 'bob@petmed.local', 'active'),
('b0000000-0000-0000-0000-000000000004', 'reviewer1', '$2b$12$s1L9m9cOClNxK1VTEDLLqOI/q0DJeCr4VuJOvocoW39pttaYbgZbm', 'Carol Reviewer', 'carol@petmed.local', 'active'),
('b0000000-0000-0000-0000-000000000005', 'reviewer2', '$2b$12$s1L9m9cOClNxK1VTEDLLqOI/q0DJeCr4VuJOvocoW39pttaYbgZbm', 'Eve Reviewer', 'eve@petmed.local', 'active');

-- User-Role assignments
INSERT INTO user_roles (user_id, role_id) VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002'),
('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000003'),
('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004'),
('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000004');

-- Warehouses
INSERT INTO warehouses (id, name, code, address) VALUES
('c0000000-0000-0000-0000-000000000001', 'Main Warehouse', 'WH-MAIN', '100 Warehouse Blvd'),
('c0000000-0000-0000-0000-000000000002', 'East Warehouse', 'WH-EAST', '200 East Industrial Dr');

-- Stores
INSERT INTO stores (id, name, code, address) VALUES
('d0000000-0000-0000-0000-000000000001', 'Downtown Pet Clinic', 'ST-DT01', '50 Main St'),
('d0000000-0000-0000-0000-000000000002', 'Suburban Pet Supply', 'ST-SB01', '300 Oak Ave');

-- Store-Warehouse mappings
INSERT INTO store_warehouses (store_id, warehouse_id) VALUES
('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002');

-- Departments
INSERT INTO departments (id, name, code) VALUES
('e0000000-0000-0000-0000-000000000001', 'Pharmaceuticals', 'PHARMA'),
('e0000000-0000-0000-0000-000000000002', 'Supplies', 'SUPPLIES'),
('e0000000-0000-0000-0000-000000000003', 'Research', 'RESEARCH');

-- User Scopes
INSERT INTO user_scopes (user_id, scope_type, scope_id) VALUES
('b0000000-0000-0000-0000-000000000002', 'store', 'd0000000-0000-0000-0000-000000000001'),
('b0000000-0000-0000-0000-000000000003', 'warehouse', 'c0000000-0000-0000-0000-000000000001');

INSERT INTO user_scopes (user_id, scope_type, scope_id) VALUES
('b0000000-0000-0000-0000-000000000005', 'department', 'e0000000-0000-0000-0000-000000000003');

-- Categories
INSERT INTO categories (id, name, slug, sort_order) VALUES
('f0000000-0000-0000-0000-000000000001', 'Pharmaceuticals', 'pharmaceuticals', 1),
('f0000000-0000-0000-0000-000000000002', 'Vaccines', 'vaccines', 2),
('f0000000-0000-0000-0000-000000000003', 'Supplements', 'supplements', 3),
('f0000000-0000-0000-0000-000000000004', 'Supplies', 'supplies', 4);

INSERT INTO categories (id, name, slug, parent_id, sort_order) VALUES
('f0000000-0000-0000-0000-000000000011', 'Antibiotics', 'antibiotics', 'f0000000-0000-0000-0000-000000000001', 1),
('f0000000-0000-0000-0000-000000000012', 'Pain Relief', 'pain-relief', 'f0000000-0000-0000-0000-000000000001', 2),
('f0000000-0000-0000-0000-000000000021', 'Core Vaccines', 'core-vaccines', 'f0000000-0000-0000-0000-000000000002', 1);

-- Tags
INSERT INTO tags (id, name, slug) VALUES
('11000000-0000-0000-0000-000000000001', 'Dogs', 'dogs'),
('11000000-0000-0000-0000-000000000002', 'Cats', 'cats'),
('11000000-0000-0000-0000-000000000003', 'Prescription', 'prescription'),
('11000000-0000-0000-0000-000000000004', 'OTC', 'otc');

-- Suppliers
INSERT INTO suppliers (id, name, contact_info) VALUES
('12000000-0000-0000-0000-000000000001', 'PharmaVet Inc', '{"phone": "555-0100", "email": "orders@pharmavet.local"}'),
('12000000-0000-0000-0000-000000000002', 'PetSupply Direct', '{"phone": "555-0200", "email": "sales@petsupply.local"}'),
('12000000-0000-0000-0000-000000000003', 'VaxCorp Animal', '{"phone": "555-0300", "email": "supply@vaxcorp.local"}');

-- Sample SPUs
INSERT INTO spus (id, name, description, category_id, status) VALUES
('13000000-0000-0000-0000-000000000001', 'Amoxicillin for Dogs', 'Broad-spectrum antibiotic for canine use', 'f0000000-0000-0000-0000-000000000011', 'published'),
('13000000-0000-0000-0000-000000000002', 'Carprofen Tablets', 'NSAID pain relief for dogs', 'f0000000-0000-0000-0000-000000000012', 'published'),
('13000000-0000-0000-0000-000000000003', 'Rabies Vaccine (Canine)', 'Core rabies vaccine for dogs', 'f0000000-0000-0000-0000-000000000021', 'published');

-- SPU Tags
INSERT INTO spu_tags (spu_id, tag_id) VALUES
('13000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001'),
('13000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000003'),
('13000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000001'),
('13000000-0000-0000-0000-000000000002', '11000000-0000-0000-0000-000000000003'),
('13000000-0000-0000-0000-000000000003', '11000000-0000-0000-0000-000000000001');

-- Spec Attributes
INSERT INTO spec_attributes (spu_id, name, values) VALUES
('13000000-0000-0000-0000-000000000001', 'strength', '["50mg", "100mg", "250mg"]'),
('13000000-0000-0000-0000-000000000001', 'flavor', '["plain", "beef"]'),
('13000000-0000-0000-0000-000000000002', 'strength', '["25mg", "75mg", "100mg"]'),
('13000000-0000-0000-0000-000000000003', 'size', '["1ml", "3ml"]');

-- SKUs
INSERT INTO skus (id, spu_id, sku_code, spec_combination, status) VALUES
('14000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'AMOX-50-PLAIN', '{"strength": "50mg", "flavor": "plain"}', 'published'),
('14000000-0000-0000-0000-000000000002', '13000000-0000-0000-0000-000000000001', 'AMOX-100-BEEF', '{"strength": "100mg", "flavor": "beef"}', 'published'),
('14000000-0000-0000-0000-000000000003', '13000000-0000-0000-0000-000000000002', 'CARP-75', '{"strength": "75mg"}', 'published'),
('14000000-0000-0000-0000-000000000004', '13000000-0000-0000-0000-000000000003', 'RAB-VAX-1ML', '{"size": "1ml"}', 'published');

-- SKU-Supplier Pricing
INSERT INTO sku_suppliers (sku_id, supplier_id, unit_price, moq, pack_size, is_preferred, is_taxable) VALUES
('14000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 2.50, 12, 12, true, true),
('14000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000002', 2.75, 6, 6, false, true),
('14000000-0000-0000-0000-000000000002', '12000000-0000-0000-0000-000000000001', 3.00, 12, 12, true, true),
('14000000-0000-0000-0000-000000000003', '12000000-0000-0000-0000-000000000001', 8.50, 6, 6, true, true),
('14000000-0000-0000-0000-000000000003', '12000000-0000-0000-0000-000000000002', 9.00, 1, 1, false, true),
('14000000-0000-0000-0000-000000000004', '12000000-0000-0000-0000-000000000003', 15.00, 10, 10, true, false);

-- Inventory
INSERT INTO inventory (id, sku_id, warehouse_id, available_qty, reserved_qty) VALUES
('15000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 120, 0),
('15000000-0000-0000-0000-000000000002', '14000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 48, 0),
('15000000-0000-0000-0000-000000000003', '14000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 12, 0),
('15000000-0000-0000-0000-000000000004', '14000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001', 4, 0);

-- Constrained slots for vaccine inventory (seat-style)
INSERT INTO constrained_slots (inventory_id, row_code, position_index, status)
SELECT '15000000-0000-0000-0000-000000000004', 'ROW-A', generate_series(1, 10), 'available';
INSERT INTO constrained_slots (inventory_id, row_code, position_index, status)
SELECT '15000000-0000-0000-0000-000000000004', 'ROW-B', generate_series(1, 10), 'available';

-- System Configuration
INSERT INTO system_config (key, value, description) VALUES
('handling_fee', '{"type": "flat", "amount": 5.00, "per": "supplier_split"}', 'Handling fee applied per supplier split in an order'),
('tax_rules', '{"default_rate": 0.08, "rules": [{"store_code": "ST-DT01", "rate": 0.085}, {"store_code": "ST-SB01", "rate": 0.07}]}', 'Sales tax rates by store location'),
('hold_duration_minutes', '{"value": 10}', 'Duration of constrained inventory holds in minutes'),
('task_score_weights', '{"time_window": 0.4, "workload": 0.3, "reputation": 0.3}', 'Weights for task recommendation scoring');

-- Worker Metrics for dispatcher
INSERT INTO worker_metrics (user_id, completed_count, failed_count, avg_completion_minutes, reputation_score, active_task_count) VALUES
('b0000000-0000-0000-0000-000000000003', 0, 0, 0, 50.0, 0);

-- Projects
INSERT INTO projects (id, name, description, department_id) VALUES
('16000000-0000-0000-0000-000000000001', 'Canine Antibiotic Efficacy Study', 'Study on amoxicillin effectiveness in canines', 'e0000000-0000-0000-0000-000000000003'),
('16000000-0000-0000-0000-000000000002', 'Vaccine Distribution Optimization', 'Improving vaccine cold chain and distribution', 'e0000000-0000-0000-0000-000000000003');

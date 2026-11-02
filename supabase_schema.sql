-- =========================================================================
-- COMPLETE SUPABASE SQL SCHEMA FOR BLUE DREAM / ZENPOS
-- Run this entire script in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Safe to run on both fresh and existing databases (idempotent).
-- =========================================================================

-- 1. Create custom users table linked to Supabase Auth
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) DEFAULT 'cashier' CHECK (role IN ('admin', 'manager', 'cashier', 'sales_executive')),
    is_locked BOOLEAN DEFAULT FALSE,
    permissions JSONB DEFAULT '["pos", "returns", "sales"]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Backfill columns if table already existed
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '["pos", "returns", "sales"]'::jsonb;

-- 2. Create Products Table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    brand VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);

-- 3. Create Product Variants Table
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    sku VARCHAR(100) UNIQUE,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    size VARCHAR(50),
    color VARCHAR(50),
    purchase_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    min_stock_level INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_variants_barcode ON public.product_variants(barcode);
CREATE INDEX IF NOT EXISTS idx_variants_sku ON public.product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_stock_min ON public.product_variants(stock_quantity, min_stock_level);

-- 4. Create Suppliers Table
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(100),
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create Purchases Table
CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    purchase_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    shipping_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'RECEIVED',
    invoice_number VARCHAR(100),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Create Purchase Items Table
CREATE TABLE IF NOT EXISTS public.purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID REFERENCES public.purchases(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Create Sales Table
CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_code VARCHAR(50),
    sale_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    payable_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH',
    received_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    change_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    due_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    customer_phone VARCHAR(50),
    customer_name VARCHAR(255),
    guarantor_name VARCHAR(255),
    guarantor_phone VARCHAR(50),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Backfill columns if table already existed
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS invoice_code VARCHAR(50);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS due_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_sales_invoice_code ON public.sales(invoice_code);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON public.sales(sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer_phone ON public.sales(customer_phone);
CREATE INDEX IF NOT EXISTS idx_sales_created ON public.sales(created_at DESC);

-- 8. Create Sale Items Table
CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    sale_type VARCHAR(20) DEFAULT 'SALE' CHECK (sale_type IN ('SALE', 'RETURN')),
    return_date DATE DEFAULT NULL,
    is_returned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_variant_id ON public.sale_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_type ON public.sale_items(sale_type);

-- 9. Create Stock Ledger Table
CREATE TABLE IF NOT EXISTS public.stock_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL, -- 'PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN'
    quantity_change INTEGER NOT NULL,
    reference_id UUID,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_variant ON public.stock_ledger(variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_created ON public.stock_ledger(created_at DESC);

-- 10. Create Expenses Table
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    description TEXT,
    expense_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);

-- Drop legacy payment_collections if present (all collections/dues are maintained directly in sales table)
DROP TABLE IF EXISTS public.payment_collections CASCADE;

-- =========================================================================
-- 12. Enable Row Level Security (RLS) & Policies
-- =========================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Clean existing policies so this script can be re-run without duplicate policy errors
DROP POLICY IF EXISTS "Allow all for users" ON public.users;
DROP POLICY IF EXISTS "Allow all for products" ON public.products;
DROP POLICY IF EXISTS "Allow all for product_variants" ON public.product_variants;
DROP POLICY IF EXISTS "Allow all for suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Allow all for purchases" ON public.purchases;
DROP POLICY IF EXISTS "Allow all for purchase_items" ON public.purchase_items;
DROP POLICY IF EXISTS "Allow all for sales" ON public.sales;
DROP POLICY IF EXISTS "Allow all for sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Allow all for stock_ledger" ON public.stock_ledger;
DROP POLICY IF EXISTS "Allow all for expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow read for all authenticated/anon" ON public.users;
DROP POLICY IF EXISTS "Allow read for all authenticated/anon" ON public.products;
DROP POLICY IF EXISTS "Allow read for all authenticated/anon" ON public.product_variants;
DROP POLICY IF EXISTS "Allow read for all authenticated/anon" ON public.suppliers;
DROP POLICY IF EXISTS "Allow read for all authenticated/anon" ON public.purchases;
DROP POLICY IF EXISTS "Allow read for all authenticated/anon" ON public.purchase_items;
DROP POLICY IF EXISTS "Allow read for all authenticated/anon" ON public.sales;
DROP POLICY IF EXISTS "Allow read for all authenticated/anon" ON public.sale_items;
DROP POLICY IF EXISTS "Allow read for all authenticated/anon" ON public.stock_ledger;
DROP POLICY IF EXISTS "Allow read for all authenticated/anon" ON public.expenses;

-- Create open RLS policies (allow full access for client app with anon / auth keys)
CREATE POLICY "Allow all for users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for products" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for product_variants" ON public.product_variants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for suppliers" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for purchases" ON public.purchases FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for purchase_items" ON public.purchase_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for sales" ON public.sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for sale_items" ON public.sale_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for stock_ledger" ON public.stock_ledger FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);

-- =========================================================================
-- 13. Automatic Triggers & Functions
-- =========================================================================

-- Trigger: Sync Supabase Auth users to public.users profiles table
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, role, full_name, phone, permissions, is_locked)
    VALUES (
      NEW.id, 
      NEW.email, 
      COALESCE(NEW.raw_user_meta_data->>'role', 'cashier'),
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Shop Staff'),
      NEW.raw_user_meta_data->>'phone',
      COALESCE(NEW.raw_user_meta_data->'permissions', '["pos", "returns", "sales"]'::jsonb),
      COALESCE((NEW.raw_user_meta_data->>'is_locked')::boolean, false)
    )
    ON CONFLICT (id) DO UPDATE
    SET 
      email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
      role = COALESCE(EXCLUDED.role, public.users.role),
      phone = COALESCE(EXCLUDED.phone, public.users.phone);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: Auto-confirm email for all new users (avoids "Email not confirmed" block)
CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS TRIGGER AS $$
BEGIN
    NEW.email_confirmed_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_auto_confirm ON auth.users;
CREATE TRIGGER on_auth_user_created_auto_confirm
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_user();

-- Auto-confirm any existing unconfirmed users
UPDATE auth.users 
SET email_confirmed_at = timezone('utc'::text, now()) 
WHERE email_confirmed_at IS NULL;

-- Trigger: Automatically increase stock when purchase items are added
CREATE OR REPLACE FUNCTION public.after_purchase_item_insert()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.product_variants
    SET stock_quantity = stock_quantity + NEW.quantity
    WHERE id = NEW.variant_id;

    INSERT INTO public.stock_ledger (variant_id, transaction_type, quantity_change, reference_id, notes)
    VALUES (NEW.variant_id, 'PURCHASE', NEW.quantity, NEW.purchase_id, 'Purchase entry added');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_after_purchase_item_insert ON public.purchase_items;
CREATE TRIGGER trg_after_purchase_item_insert
AFTER INSERT ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.after_purchase_item_insert();

-- Trigger: Automatically deduct / add stock when sale items are inserted
CREATE OR REPLACE FUNCTION public.after_sale_item_insert()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sale_type = 'RETURN' OR NEW.is_returned = true THEN
        UPDATE public.product_variants
        SET stock_quantity = stock_quantity + NEW.quantity
        WHERE id = NEW.variant_id;

        INSERT INTO public.stock_ledger (variant_id, transaction_type, quantity_change, reference_id, notes)
        VALUES (NEW.variant_id, 'RETURN', NEW.quantity, NEW.sale_id, 'Product returned / refunded');
    ELSE
        UPDATE public.product_variants
        SET stock_quantity = stock_quantity - NEW.quantity
        WHERE id = NEW.variant_id;

        INSERT INTO public.stock_ledger (variant_id, transaction_type, quantity_change, reference_id, notes)
        VALUES (NEW.variant_id, 'SALE', -NEW.quantity, NEW.sale_id, 'Sale checked out');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_after_sale_item_insert ON public.sale_items;
CREATE TRIGGER trg_after_sale_item_insert
AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.after_sale_item_insert();

-- Trigger: Restore stock when sale items are deleted
CREATE OR REPLACE FUNCTION public.after_sale_item_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.product_variants
    SET stock_quantity = stock_quantity + OLD.quantity
    WHERE id = OLD.variant_id;

    INSERT INTO public.stock_ledger (variant_id, transaction_type, quantity_change, reference_id, notes)
    VALUES (OLD.variant_id, 'RETURN', OLD.quantity, OLD.sale_id, 'Restocked from deleted sale invoice');

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_after_sale_item_delete ON public.sale_items;
CREATE TRIGGER trg_after_sale_item_delete
AFTER DELETE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.after_sale_item_delete();

-- Trigger: Adjust stock when sale items are edited (quantity or variant changed)
CREATE OR REPLACE FUNCTION public.after_sale_item_update()
RETURNS TRIGGER AS $$
DECLARE
    qty_diff INTEGER;
BEGIN
    IF OLD.variant_id = NEW.variant_id THEN
        qty_diff := NEW.quantity - OLD.quantity;
        IF qty_diff <> 0 THEN
            UPDATE public.product_variants
            SET stock_quantity = stock_quantity - qty_diff
            WHERE id = NEW.variant_id;

            INSERT INTO public.stock_ledger (variant_id, transaction_type, quantity_change, reference_id, notes)
            VALUES (
                NEW.variant_id, 
                CASE WHEN qty_diff > 0 THEN 'SALE' ELSE 'RETURN' END, 
                -qty_diff, 
                NEW.sale_id, 
                'Sale invoice edited: quantity changed from ' || OLD.quantity || ' to ' || NEW.quantity
            );
        END IF;
    ELSE
        -- Variant was swapped
        UPDATE public.product_variants
        SET stock_quantity = stock_quantity + OLD.quantity
        WHERE id = OLD.variant_id;

        INSERT INTO public.stock_ledger (variant_id, transaction_type, quantity_change, reference_id, notes)
        VALUES (OLD.variant_id, 'RETURN', OLD.quantity, OLD.sale_id, 'Restocked from swapped sale item');

        UPDATE public.product_variants
        SET stock_quantity = stock_quantity - NEW.quantity
        WHERE id = NEW.variant_id;

        INSERT INTO public.stock_ledger (variant_id, transaction_type, quantity_change, reference_id, notes)
        VALUES (NEW.variant_id, 'SALE', -NEW.quantity, NEW.sale_id, 'Deducted for newly swapped sale item');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_after_sale_item_update ON public.sale_items;
CREATE TRIGGER trg_after_sale_item_update
AFTER UPDATE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.after_sale_item_update();

-- =========================================================================
-- 14. Seed Super / Master Administrator Account
-- Phone: 01825334505 | Password: 01906872
-- =========================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user_id UUID := '84787c16-4295-4b8f-bc8c-49a01fd12d77';
  v_email TEXT := '01825334505@zenpos.local';
  v_phone TEXT := '01825334505';
  v_password TEXT := '01906872';
  v_full_name TEXT := 'MD Arif Uddin (Master Admin)';
  v_role TEXT := 'admin';
  v_permissions JSONB := '["pos", "returns", "products", "stock", "sales", "expenses", "users", "reports"]'::jsonb;
BEGIN
  -- 1. Insert or update in auth.users
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id OR email = v_email) THEN
    UPDATE auth.users
    SET 
      encrypted_password = crypt(v_password, gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, timezone('utc'::text, now())),
      raw_user_meta_data = jsonb_build_object(
        'full_name', v_full_name,
        'role', v_role,
        'phone', v_phone,
        'permissions', v_permissions,
        'is_locked', false
      ),
      raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
      updated_at = timezone('utc'::text, now())
    WHERE id = v_user_id OR email = v_email;
  ELSE
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      v_email,
      crypt(v_password, gen_salt('bf')),
      timezone('utc'::text, now()),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object(
        'full_name', v_full_name,
        'role', v_role,
        'phone', v_phone,
        'permissions', v_permissions,
        'is_locked', false
      ),
      'authenticated',
      'authenticated',
      timezone('utc'::text, now()),
      timezone('utc'::text, now())
    );
  END IF;

  -- 2. Insert or update in auth.identities (if identities table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'identities') THEN
    DELETE FROM auth.identities WHERE user_id = v_user_id;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id') THEN
      EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) ' ||
              'VALUES ($1, $2, $3, ''email'', $4, now(), now(), now())'
      USING v_user_id, v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', v_email), v_user_id::text;
    ELSE
      EXECUTE 'INSERT INTO auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) ' ||
              'VALUES ($1, $2, $3, ''email'', now(), now(), now())'
      USING v_user_id, v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', v_email);
    END IF;
  END IF;

  -- 3. Upsert into public.users profile table
  INSERT INTO public.users (
    id,
    email,
    full_name,
    phone,
    role,
    is_locked,
    permissions
  ) VALUES (
    v_user_id,
    v_email,
    v_full_name,
    v_phone,
    v_role,
    false,
    v_permissions
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    role = EXCLUDED.role,
    is_locked = false,
    permissions = EXCLUDED.permissions;
END $$;


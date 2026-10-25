    -- =========================
    -- 1. DATABASE
    -- =========================
    CREATE DATABASE ecommerce_db;

    \c ecommerce_db;

    -- =========================
    -- 2. ENUM TYPES
    -- =========================

    CREATE TYPE user_role AS ENUM ('admin', 'customer');

    CREATE TYPE product_status AS ENUM ('draft', 'published', 'archived');

    CREATE TYPE payment_status AS ENUM ('pending', 'successful', 'failed', 'refunded');

    CREATE TYPE order_status AS ENUM (
    'awaiting_payment',
    'payment_under_review',
    'paid',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
    'expired'
    );

    CREATE TYPE payment_method AS ENUM ('chapa', 'cod');


    -- =========================
    -- 3. USERS
    -- =========================
    CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone VARCHAR(20),
        avatar TEXT,
        avatar_public_id text,
        provider VARCHAR(20) NOT NULL DEFAULT 'local',
        role user_role DEFAULT 'customer',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_users_email ON users(email);


    -- =========================
    -- 4. ADDRESSES
    -- =========================
    CREATE TABLE addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        receiver_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        city VARCHAR(100) NOT NULL,
        sub_city VARCHAR(100) NOT NULL,
        address TEXT NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_addresses_user ON addresses(user_id);


    -- =========================
    -- 5. CATEGORIES
    -- =========================
    CREATE TABLE categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );

CREATE TABLE products (
    id SERIAL PRIMARY KEY,

    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,

    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),

    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),

    color VARCHAR(50) NOT NULL,

    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,

    image_url TEXT NOT NULL,
    image_public_id TEXT NOT NULL,

    status product_status DEFAULT 'draft',

    featured BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);





    -- =========================
    -- 8. CARTS
    -- =========================
    CREATE TABLE carts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW()
    );


    -- =========================
    -- 9. CART ITEMS
    -- =========================
    CREATE TABLE cart_items (
        id SERIAL PRIMARY KEY,
        cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
        created_at TIMESTAMP DEFAULT NOW(),

        UNIQUE(cart_id, product_id)
    );

    CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);


    -- =========================
    -- 10. WISHLISTS
    -- =========================
    CREATE TABLE wishlists (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW()
    );


    -- =========================
    -- 11. WISHLIST ITEMS
    -- =========================
    CREATE TABLE wishlist_items (
        id SERIAL PRIMARY KEY,
        wishlist_id INTEGER NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW(),

        UNIQUE(wishlist_id, product_id)
    );


    -- =========================
    -- 12. REVIEWS
    -- =========================
    CREATE TABLE reviews (
        id SERIAL PRIMARY KEY,  
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title VARCHAR(255),
        comment TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),

        UNIQUE(user_id, product_id)
    );


    -- =========================
    -- 13. ORDERS
    -- =========================
    CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        address_id INTEGER REFERENCES addresses(id) ON DELETE SET NULL,
        payment_method payment_method NOT NULL,
        payment_status payment_status DEFAULT 'pending',
        order_status order_status DEFAULT 'awaiting_payment',
        total_price DECIMAL(10,2) NOT NULL CHECK (total_price >= 0),
        tracking_number VARCHAR(100),
        notes TEXT,
        tx_ref VARCHAR(100) UNIQUE,
        checkout_key VARCHAR(100),
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_orders_user ON orders(user_id);
    CREATE INDEX idx_orders_status ON orders(order_status);
    CREATE INDEX idx_orders_expires ON orders(expires_at);
    CREATE UNIQUE INDEX idx_orders_user_checkout_key ON orders(user_id, checkout_key) WHERE checkout_key IS NOT NULL;


    -- =========================
    -- 14. ORDER ITEMS
    -- =========================
    CREATE TABLE order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        price_at_purchase DECIMAL(10,2) NOT NULL CHECK (price_at_purchase >= 0)
    );

    CREATE INDEX idx_order_items_order ON order_items(order_id);


    -- =========================
    -- 15. PAYMENTS (CHAPA READY)
    -- =========================
    CREATE TABLE payments (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        method payment_method NOT NULL,
        provider VARCHAR(50) DEFAULT 'chapa',
        status payment_status DEFAULT 'pending',
        tx_ref VARCHAR(255) UNIQUE NOT NULL,
        transaction_id VARCHAR(255),
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX idx_payments_order ON payments(order_id);
    CREATE INDEX idx_payments_tx_ref ON payments(tx_ref);


    -- =========================
    -- 16. SETTINGS
    -- =========================
    CREATE TABLE settings (
        id SERIAL PRIMARY KEY,
        store_name VARCHAR(255) NOT NULL,
        store_logo TEXT,
        cod_enabled BOOLEAN DEFAULT TRUE,
        theme VARCHAR(30) DEFAULT 'light',
        currency VARCHAR(20) DEFAULT 'ETB',
        contact_email VARCHAR(255),
        contact_phone VARCHAR(30),
        updated_at TIMESTAMP DEFAULT NOW()
    );














































































    -- =========================
    -- 7. PRODUCT IMAGES
    -- =========================
    CREATE TABLE product_images (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        display_order INTEGER DEFAULT 1
    );

    CREATE INDEX idx_product_images_product ON product_images(product_id);

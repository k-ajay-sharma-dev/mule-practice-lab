-- Run once by the PostgreSQL container on first start.
-- 50 customers with 5 address rows each.
CREATE TABLE customer_address (
    address_id  SERIAL PRIMARY KEY,
    customer_id INT  NOT NULL,
    city        TEXT NOT NULL
);

INSERT INTO customer_address (customer_id, city)
SELECT c, 'City ' || c || '-' || a
FROM generate_series(1, 50) AS c, generate_series(1, 5) AS a;

CREATE INDEX idx_customer_address_customer ON customer_address (customer_id);

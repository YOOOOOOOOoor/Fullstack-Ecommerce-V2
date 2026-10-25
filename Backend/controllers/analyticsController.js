import pool from "../config/db.js";

// Dashboard overview cards
export const getDashboardStats = async (req, res, next) => {
  try {
    const stats = await pool.query(`
    WITH business_clock AS (
      SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Addis_Ababa')::date AS today
    ), customer_periods AS (
      SELECT today,
        date_trunc('month', today::timestamp) AS month_start,
        date_trunc('month', today::timestamp) - INTERVAL '1 month' AS previous_month_start,
        LEAST(
          date_trunc('month', today::timestamp) - INTERVAL '1 day',
          date_trunc('month', today::timestamp) - INTERVAL '1 month'
            + (EXTRACT(DAY FROM today)::int - 1) * INTERVAL '1 day'
        ) AS previous_month_end
      FROM business_clock
    ), customer_counts AS (
      SELECT
        COUNT(*) FILTER (WHERE u.created_at >= cp.month_start AND u.created_at < cp.today + 1)::int AS new_customers_this_month,
        COUNT(*) FILTER (WHERE u.created_at >= cp.previous_month_start AND u.created_at < cp.previous_month_end + INTERVAL '1 day')::int AS new_customers_previous_month
      FROM users u CROSS JOIN customer_periods cp
      WHERE u.role='customer' AND NOT EXISTS (SELECT 1 FROM driver_profiles dp WHERE dp.user_id=u.id)
    ), customer_trend AS (
      SELECT COALESCE(json_agg(json_build_object('date', to_char(months.month_start, 'YYYY-MM'), 'customers', counts.customers) ORDER BY months.month_start), '[]'::json) AS new_customer_trend
      FROM customer_periods cp
      CROSS JOIN LATERAL generate_series(cp.month_start - INTERVAL '11 months', cp.month_start, INTERVAL '1 month') AS months(month_start)
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS customers FROM users u
        WHERE u.role='customer' AND NOT EXISTS (SELECT 1 FROM driver_profiles dp WHERE dp.user_id=u.id)
          AND u.created_at >= months.month_start AND u.created_at < months.month_start + INTERVAL '1 month'
      ) counts ON TRUE
    )
    SELECT

    (SELECT COUNT(*)
     FROM products) 
     AS total_products,


    (SELECT COUNT(*) 
     FROM users
     WHERE role='customer' AND NOT EXISTS (SELECT 1 FROM driver_profiles dp WHERE dp.user_id=users.id))
     AS total_customers,


    (SELECT COUNT(*)
     FROM orders)
     AS total_orders,


    (SELECT COUNT(*)
     FROM orders
     WHERE payment_status='successful')
     AS paid_orders,


    (SELECT COUNT(*)
     FROM orders
     WHERE order_status='awaiting_payment')
     AS pending_orders,


    (SELECT COUNT(*)
     FROM products
     WHERE stock <= 5)
     AS low_stock_products,


    (SELECT COUNT(*)
     FROM products
     WHERE stock = 0)
     AS out_of_stock_products,
     customer_counts.new_customers_this_month,
     customer_counts.new_customers_previous_month,
     customer_trend.new_customer_trend
    FROM customer_counts CROSS JOIN customer_trend
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// Low stock products list
export const getLowStockProducts = async (req, res, next) => {
  try {
    const products = await pool.query(`

    SELECT

    id,
    title,
    stock,
    price,
    image_url


    FROM products


    WHERE stock <= 5


    ORDER BY stock ASC


    LIMIT 10;

    `);

    res.json(products.rows);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// Recent orders
export const getRecentOrders = async (req, res, next) => {
  try {
    const orders = await pool.query(`

    SELECT

    o.id,
    o.total_price,
    o.payment_status,
    o.order_status,
    o.created_at,


    u.name


    FROM orders o


    JOIN users u

    ON o.user_id=u.id


    ORDER BY o.created_at DESC


    LIMIT 10;


    `);

    res.json(orders.rows);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// Revenue cards
export const getRevenue = async (req, res, next) => {
  try {
    const revenue = await pool.query(`
      WITH business_clock AS (
        SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Addis_Ababa')::date AS today
      )
      SELECT
        COALESCE(SUM(o.total_price) FILTER (WHERE o.payment_status='successful'), 0) AS total_revenue,
        COALESCE(SUM(o.total_price) FILTER (
          WHERE o.payment_status='successful'
            AND o.created_at >= bc.today::timestamp
            AND o.created_at < (bc.today + 1)::timestamp
        ), 0) AS today,
        COALESCE(SUM(o.total_price) FILTER (
          WHERE o.payment_status='successful'
            AND o.created_at >= (bc.today - (EXTRACT(ISODOW FROM bc.today)::int - 1))::timestamp
            AND o.created_at < (bc.today + 1)::timestamp
        ), 0) AS this_week,
        COALESCE(SUM(o.total_price) FILTER (
          WHERE o.payment_status='successful'
            AND o.created_at >= date_trunc('month', bc.today::timestamp)
            AND o.created_at < (bc.today + 1)::timestamp
        ), 0) AS this_month,
        COALESCE(SUM(o.total_price) FILTER (
          WHERE o.payment_status='successful'
            AND o.created_at >= date_trunc('year', bc.today::timestamp)
            AND o.created_at < (bc.today + 1)::timestamp
        ), 0) AS this_year
      FROM business_clock bc LEFT JOIN orders o ON TRUE
    `);

    res.json(revenue.rows[0]);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

export const getRevenueChart = async (req, res, next) => {
  try {
    const chart = await pool.query(`
 
 SELECT

 TO_CHAR(
   DATE(created_at),
   'Mon DD'
 ) AS date,


 COALESCE(
   SUM(total_price),
   0
 ) AS revenue


 FROM orders


 WHERE payment_status='successful'


 AND created_at >= CURRENT_DATE - INTERVAL '30 days'


 GROUP BY DATE(created_at)


 ORDER BY DATE(created_at);


 `);

    res.json(
      chart.rows.map((item) => ({
        date: item.date,
        revenue: Number(item.revenue),
      })),
    );
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

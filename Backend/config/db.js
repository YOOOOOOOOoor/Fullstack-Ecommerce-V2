import pg from "pg";
const { Pool } = pg;
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,

  ssl: {
    rejectUnauthorized: false,
  },
});

export default pool;

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////

//for local only
//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////

// import pg from "pg";
// const { Pool } = pg;
// import dotenv from "dotenv";

// dotenv.config();

// let pool;

// if (process.env.DATABASE_URL) {
//   // Render + Neon
//   pool = new Pool({
//     connectionString: process.env.DATABASE_URL,
//     ssl: {
//       rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
//     },
//   });
// } else {
//   // Local PostgreSQL
//   pool = new Pool({
//     host: process.env.DB_HOST,
//     port: process.env.DB_PORT,
//     database: process.env.DB_NAME,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//   });
// }

// export default pool;

import ExcelJS from "exceljs";
import { ANALYTICS_TIME_ZONE } from "./analytics.js";

const C = {
  forest: "FF123D32",
  forestDark: "FF0C2B24",
  emerald: "FF70B896",
  cream: "FFF5F2EA",
  white: "FFFFFFFF",
  ink: "FF17211D",
  muted: "FF65736C",
  green: "FF236B45",
  red: "FFB42318",
};
const FORMAT = {
  currency: '"ETB" #,##0.00;[Red]("ETB" #,##0.00)',
  integer: "#,##0",
  percent: "0.0%;[Red](0.0%)",
  date: "yyyy-mm-dd",
  timestamp: "yyyy-mm-dd hh:mm:ss",
};

// Strings are always written as text, and formula-like content is prefixed so
// exported labels remain safe if a workbook is later transformed by another tool.
export function spreadsheetText(value) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/^[\u0009\u000a\u000d]+/, "");
  return /^[\s]*[=+\-@]/u.test(text) ? `'${text}` : text;
}

const excelDate = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

// Database order timestamps are timezone-naive wall-clock values. Construct an
// Excel date serial from those components without shifting them to host time.
const excelTimestamp = (value) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(...match.slice(1).map(Number).map((part, index) => index === 1 ? part - 1 : part)));
};

const excelZonedTimestamp = (value, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(value);
  const dateParts = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return new Date(Date.UTC(
    Number(dateParts.year), Number(dateParts.month) - 1, Number(dateParts.day),
    Number(dateParts.hour), Number(dateParts.minute), Number(dateParts.second),
  ));
};

const addTitle = (sheet, title, subtitle, lastColumn) => {
  const last = sheet.getColumn(lastColumn).letter;
  sheet.mergeCells(`A1:${last}1`);
  sheet.getCell("A1").value = spreadsheetText(title);
  sheet.getRow(1).height = 30;
  sheet.getRow(1).font = { name: "Aptos Display", size: 18, bold: true, color: { argb: C.white } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.forest } };
  sheet.getRow(1).alignment = { vertical: "middle" };
  sheet.mergeCells(`A2:${last}2`);
  sheet.getCell("A2").value = subtitle;
  sheet.getRow(2).height = 22;
  sheet.getRow(2).font = { name: "Aptos", size: 10, color: { argb: C.muted }, italic: true };
  sheet.getRow(2).alignment = { vertical: "middle" };
};

const addTable = (sheet, { name, headerRow, columns, rows }) => {
  const lastColumn = sheet.getColumn(columns.length).letter;
  sheet.addTable({
    name,
    ref: `A${headerRow}`,
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium4", showRowStripes: true, showColumnStripes: false },
    columns: columns.map(({ name: columnName }) => ({ name: columnName, filterButton: true })),
    rows: rows.map((row) => columns.map((column) => row[column.key] ?? null)),
  });
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    const sheetColumn = sheet.getColumn(index + 1);
    sheetColumn.width = column.width ?? 18;
    const header = sheet.getCell(headerRow, index + 1);
    header.font = { name: "Aptos", bold: true, color: { argb: C.white } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.forestDark } };
    header.alignment = { vertical: "middle", wrapText: true };
    for (let row = headerRow + 1; row <= headerRow + rows.length; row += 1) {
      const cell = sheet.getCell(row, index + 1);
      if (column.numFmt) cell.numFmt = column.numFmt;
      if (column.text) cell.value = spreadsheetText(cell.value);
      cell.alignment = { vertical: "top", horizontal: column.align ?? (column.numFmt ? "right" : "left"), wrapText: Boolean(column.wrap) };
    }
  }
  sheet.getRow(headerRow).height = 32;
  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  sheet.autoFilter = { from: `A${headerRow}`, to: `${lastColumn}${headerRow}` };
};

const currency = (name, key, width = 20) => ({ name, key, width, numFmt: FORMAT.currency });
const count = (name, key, width = 15) => ({ name, key, width, numFmt: FORMAT.integer });
const safeRows = (rows = []) => rows.map((row) => ({ ...row }));

export async function createAnalyticsWorkbook(report, generatedAt = new Date()) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Store Analytics";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.subject = "Admin analytics report";
  workbook.title = "Store Analytics";
  workbook.company = report.storeName || "Store";

  // Overview contains typed KPI values and a separately filterable comparison table.
  const overview = workbook.addWorksheet("Overview");
  overview.properties.tabColor = C.forest;
  overview.columns = [{ width: 32 }, { width: 24 }, { width: 24 }, { width: 20 }, { width: 18 }];
  addTitle(overview, `${report.storeName || "Store"} | Analytics Report`, "Management summary and period comparison", 5);
  const comparisonLabel = report.comparisonUnavailable
    ? `${report.period.comparison?.label || "Comparison"} (unavailable)`
    : report.comparison?.label || "Not available for this report period";
  const details = [
    { field: "Selected period", value: report.period.label },
    { field: "Start date", value: excelDate(report.period.startDate), kind: "date" },
    { field: "End date", value: excelDate(report.period.endDate), kind: "date" },
    { field: "Reporting interval", value: report.period.interval },
    { field: "Reporting timezone", value: ANALYTICS_TIME_ZONE },
    { field: "Generated at", value: excelZonedTimestamp(generatedAt, ANALYTICS_TIME_ZONE) },
    { field: "Comparison basis", value: comparisonLabel },
  ];
  addTable(overview, {
    name: "ReportDetails",
    headerRow: 4,
    columns: [{ name: "Report detail", key: "field", width: 32, text: true }, { name: "Value", key: "value", width: 80, text: true }],
    rows: details.map((item) => ({ ...item, value: item.value instanceof Date ? item.value : spreadsheetText(item.value) })),
  });
  overview.getColumn(2).width = 80;
  for (let index = 0; index < details.length; index += 1) {
    const detail = details[index];
    if (detail.kind === "date") overview.getCell(5 + index, 2).numFmt = FORMAT.date;
    if (detail.field === "Generated at") overview.getCell(5 + index, 2).numFmt = `${FORMAT.timestamp} "${ANALYTICS_TIME_ZONE}"`;
  }

  const kpiHeader = 14;
  overview.getCell(kpiHeader - 1, 1).value = "Key performance indicators";
  overview.getCell(kpiHeader - 1, 1).font = { size: 12, bold: true, color: { argb: C.forest } };
  const kpis = [
    { metric: "Gross revenue", value: report.revenue, format: FORMAT.currency },
    { metric: "Net revenue", value: report.secondaryMetrics.netRevenue, format: FORMAT.currency },
    { metric: "Total orders", value: report.orders, format: FORMAT.integer },
    { metric: "Average order value", value: report.averageOrder, format: FORMAT.currency },
    { metric: "Confirmed refunds", value: report.refundSummary.confirmedAmount, format: FORMAT.currency },
    { metric: "Items sold", value: report.secondaryMetrics.itemsSold, format: FORMAT.integer },
    { metric: "Customers with paid orders", value: report.customers, format: FORMAT.integer },
    { metric: "Cancellation rate", value: report.secondaryMetrics.cancellationRate === null ? "Unavailable (no orders placed)" : report.secondaryMetrics.cancellationRate / 100, format: report.secondaryMetrics.cancellationRate === null ? null : FORMAT.percent },
  ];
  addTable(overview, {
    name: "ReportKPIs",
    headerRow: kpiHeader,
    columns: [{ name: "Metric", key: "metric", width: 32, text: true }, { name: "Value", key: "value", width: 24 }],
    rows: kpis.map(({ metric, value }) => ({ metric, value: typeof value === "string" ? spreadsheetText(value) : value })),
  });
  kpis.forEach((kpi, index) => { if (kpi.format) overview.getCell(kpiHeader + index + 1, 2).numFmt = kpi.format; });

  const compareHeader = 25;
  overview.getCell(compareHeader - 1, 1).value = `Period comparison — ${comparisonLabel}`;
  overview.getCell(compareHeader - 1, 1).font = { size: 12, bold: true, color: { argb: C.forest } };
  const comparisonKeys = [
    ["Gross revenue", "revenue", report.revenue, FORMAT.currency],
    ["Total orders", "orders", report.orders, FORMAT.integer],
    ["Average order value", "averageOrder", report.averageOrder, FORMAT.currency],
    ["Customers with paid orders", "customers", report.customers, FORMAT.integer],
  ];
  const comparisonRows = comparisonKeys.map(([metricName, key, current]) => {
    const metric = report.comparison?.metrics?.[key];
    const available = Boolean(metric?.comparisonAvailable);
    const previous = available ? metric.previous : null;
    return {
      metric: metricName,
      current,
      previous,
      absoluteChange: available ? current - previous : null,
      percentChange: metric?.baselineAvailable ? metric.change / 100 : null,
    };
  });
  const comparisonColumns = [
    { name: "Metric", key: "metric", width: 32, text: true },
    { name: "Current", key: "current", width: 22 },
    { name: "Previous", key: "previous", width: 22 },
    { name: "Absolute change", key: "absoluteChange", width: 22 },
    { name: "Change (%)", key: "percentChange", width: 18 },
  ];
  addTable(overview, { name: "PeriodComparison", headerRow: compareHeader, columns: comparisonColumns, rows: comparisonRows });
  comparisonKeys.forEach(([, , , format], index) => {
    for (let column = 2; column <= 4; column += 1) overview.getCell(compareHeader + index + 1, column).numFmt = format;
  });
  for (let index = 0; index < comparisonRows.length; index += 1) {
    const cell = overview.getCell(compareHeader + index + 1, 5);
    cell.numFmt = FORMAT.percent;
    cell.font = { color: { argb: comparisonRows[index].percentChange === null ? C.muted : comparisonRows[index].percentChange >= 0 ? C.green : C.red } };
  }

  const trend = workbook.addWorksheet("Revenue Trend");
  trend.properties.tabColor = C.emerald;
  addTitle(trend, "Revenue Trend", `Selected reporting period | ${report.period.interval} intervals | ${ANALYTICS_TIME_ZONE}`, 8);
  const trendRows = safeRows(report.exportRevenueTrend).sort((a, b) => a.periodKey.localeCompare(b.periodKey)).map((row) => ({
    period: excelDate(row.periodKey),
    orders: row.orders,
    grossRevenue: row.grossRevenue,
    confirmedRefunds: row.confirmedRefunds,
    netRevenue: row.netRevenue,
    itemRevenue: row.itemRevenue,
    shippingRevenue: row.shippingRevenue,
    averageOrderValue: row.averageOrderValue,
  }));
  const trendColumns = [
    { name: "Period", key: "period", width: 16, numFmt: FORMAT.date },
    count("Order count", "orders"),
    currency("Gross revenue (ETB)", "grossRevenue"),
    currency("Confirmed refunds (ETB)", "confirmedRefunds"),
    currency("Net revenue (ETB)", "netRevenue"),
    currency("Item revenue (ETB)", "itemRevenue"),
    currency("Shipping revenue (ETB)", "shippingRevenue"),
    currency("Average order value (ETB)", "averageOrderValue", 26),
  ];
  addTable(trend, { name: "RevenueTrend", headerRow: 4, columns: trendColumns, rows: trendRows });

  const products = workbook.addWorksheet("Products");
  products.properties.tabColor = C.emerald;
  addTitle(products, "Product Performance", `Top products for ${report.period.label} | Ranking: ${report.productSort === "revenue" ? "item revenue" : "units sold"}`, 8);
  const productRows = safeRows(report.bestSellingProducts).map((product, index) => ({
    rank: index + 1,
    productId: String(product.id ?? ""),
    product: spreadsheetText(product.title),
    categoryId: product.category_id == null ? "" : String(product.category_id),
    category: spreadsheetText(product.category_name || "Uncategorized"),
    unitsSold: product.sold,
    itemRevenue: product.revenue,
    averageSellingPrice: product.sold > 0 ? product.revenue / product.sold : null,
  }));
  const productColumns = [
    count("Rank", "rank", 10),
    { name: "Product ID", key: "productId", width: 16, text: true },
    { name: "Product name", key: "product", width: 38, text: true },
    { name: "Category ID", key: "categoryId", width: 16, text: true },
    { name: "Category", key: "category", width: 28, text: true },
    count("Units sold", "unitsSold"),
    currency("Item revenue (ETB)", "itemRevenue"),
    currency("Average selling price (ETB)", "averageSellingPrice", 30),
  ];
  addTable(products, { name: "ProductPerformance", headerRow: 4, columns: productColumns, rows: productRows });

  const categories = workbook.addWorksheet("Categories");
  categories.properties.tabColor = C.emerald;
  addTitle(categories, "Category Performance", `Category sales for ${report.period.label} | Current product category assignment`, 5);
  const categoryRows = safeRows(report.revenueByCategory).map((category) => ({
    categoryId: category.category_id == null ? "" : String(category.category_id),
    category: spreadsheetText(category.name),
    unitsSold: category.unitsSold,
    itemRevenue: category.revenue,
    itemRevenueShare: report.secondaryMetrics.itemRevenue > 0 ? category.revenue / report.secondaryMetrics.itemRevenue : null,
  }));
  const categoryColumns = [
    { name: "Category ID", key: "categoryId", width: 16, text: true },
    { name: "Category name", key: "category", width: 34, text: true },
    count("Units sold", "unitsSold"),
    currency("Item revenue (ETB)", "itemRevenue"),
    { name: "Share of total item revenue", key: "itemRevenueShare", width: 30, numFmt: FORMAT.percent },
  ];
  addTable(categories, { name: "CategoryPerformance", headerRow: 4, columns: categoryColumns, rows: categoryRows });

  const orderDetails = workbook.addWorksheet("Order Details");
  orderDetails.properties.tabColor = C.cream;
  addTitle(orderDetails, "Order Details", `Orders created within ${report.period.label} | Customer personal data excluded`, 11);
  const orderRows = safeRows(report.orderDetails).map((order) => ({
    orderId: String(order.order_id),
    orderDate: excelDate(order.order_date),
    orderTimestamp: excelTimestamp(order.order_timestamp),
    orderStatus: spreadsheetText(order.order_status),
    paymentStatus: spreadsheetText(order.payment_status),
    itemSubtotal: order.item_subtotal,
    shippingAmount: order.shipping_amount,
    grossOrderTotal: order.gross_order_total,
    confirmedRefunds: order.confirmed_refunds,
    netRevenue: order.net_revenue,
    itemCount: order.item_count,
  }));
  const orderColumns = [
    { name: "Order ID", key: "orderId", width: 16, text: true },
    { name: "Order date", key: "orderDate", width: 16, numFmt: FORMAT.date },
    { name: "Order timestamp (Addis Ababa)", key: "orderTimestamp", width: 30, numFmt: FORMAT.timestamp },
    { name: "Order status", key: "orderStatus", width: 20, text: true },
    { name: "Payment status", key: "paymentStatus", width: 20, text: true },
    currency("Item subtotal (ETB)", "itemSubtotal"),
    currency("Shipping amount (ETB)", "shippingAmount"),
    currency("Gross order total (ETB)", "grossOrderTotal", 26),
    currency("Confirmed refunds (ETB)", "confirmedRefunds", 26),
    currency("Net revenue (ETB)", "netRevenue"),
    count("Item count", "itemCount"),
  ];
  addTable(orderDetails, { name: "OrderDetails", headerRow: 4, columns: orderColumns, rows: orderRows });

  const metadata = workbook.addWorksheet("Definitions & Metadata");
  metadata.properties.tabColor = C.forestDark;
  addTitle(metadata, "Definitions & Metadata", "Metric definitions follow the Admin Analytics dashboard", 2);
  const definitions = [
    ["Report name", "Store Analytics Report"],
    ["Store name", report.storeName || "Store"],
    ["Selected period", report.period.label],
    ["Start date", report.period.startDate || "No order history"],
    ["End date", report.period.endDate || "No order history"],
    ["Reporting interval", report.period.interval],
    ["Generated at", generatedAt.toISOString()],
    ["Reporting timezone", ANALYTICS_TIME_ZONE],
    ["Comparison period and basis", comparisonLabel],
    ["Comparison dates", report.period.comparison ? `${report.period.comparison.startDate} to ${report.period.comparison.endDate}` : "Not available"],
    ["Gross revenue", "Sum of orders.total_price for successful or later-refunded orders created in the period; includes shipping."],
    ["Net revenue", "Gross revenue less confirmed refund amounts for those orders. Refund confirmation requires status='refunded' and refunded_at to be set."],
    ["Confirmed refunds", "Sum of refund_requests.refund_amount where status='refunded' and refunded_at is not null; associated to the order creation period."],
    ["Item revenue", "Sum of order item quantity multiplied by price_at_purchase for successful or later-refunded orders; shown before refunds."],
    ["Category revenue", "Item revenue grouped by each product's current category. Uncategorized products are retained; category order counts may overlap."],
    ["Shipping revenue", "Sum of stored orders.shipping_fee for successful or later-refunded orders in the selected period."],
    ["Average order value", "Gross revenue divided by successful or later-refunded order count; zero when there are no qualifying orders."],
    ["Customers with paid orders", "Distinct customers with a successful or later-refunded order created in the selected period."],
    ["Cancellation rate", "Orders with order_status='cancelled' divided by all orders created in the selected period; unavailable when no orders were placed. It does not indicate refunds."],
    ["Returning customers", "Customers with a successful or later-refunded order in the selected period and at least one earlier successful or refunded order."],
    ["Repeat orders", "Paid orders beyond each customer's first paid order within the selected period."],
    ["Order detail net revenue", "Gross order total less confirmed refunds only for successful or refunded payments. Blank for orders not counted as paid revenue."],
    ["Identifiers", "IDs are exported as text to preserve their exact representation."],
    ["Personal data", "Order details omit customer names, addresses, phone numbers, credentials, and payment secrets."],
    ["Unavailable dataset", "The existing analytics exporter uses ExcelJS, which does not generate native Excel charts; charts are omitted. The dashboard's comparison does not expose previous-period refunds/items, so those comparisons are omitted."],
  ].map(([field, value]) => ({ field: spreadsheetText(field), value: spreadsheetText(value) }));
  addTable(metadata, {
    name: "DefinitionsMetadata",
    headerRow: 4,
    columns: [{ name: "Field", key: "field", width: 30, text: true }, { name: "Definition or value", key: "value", width: 112, text: true, wrap: true }],
    rows: definitions,
  });
  for (let row = 5; row < 5 + definitions.length; row += 1) metadata.getRow(row).height = 34;

  // Add restrained comparison colors while keeping every signed value visible.
  overview.addConditionalFormatting({
    ref: `E${compareHeader + 1}:E${compareHeader + comparisonRows.length}`,
    rules: [
      { type: "cellIs", operator: "greaterThan", formulae: [0], style: { font: { color: { argb: C.green } } } },
      { type: "cellIs", operator: "lessThan", formulae: [0], style: { font: { color: { argb: C.red } } } },
    ],
  });

  return workbook.xlsx.writeBuffer();
}

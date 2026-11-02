# BlueDream — POS & Retail Management System

A high-performance Point of Sale (POS) and Inventory Management System built with React, TypeScript, Vite, and Supabase.

## Features
- **POS Checkout & Registers**: Fast barcode scanning, dual cart sales, exchanges, and instant returns.
- **Inventory & Stock Management**: Real-time stock levels, low-stock alerts, and automated stock ledger tracking.
- **Thermal Invoices & Barcode Printing**: Precision 80mm/58mm thermal receipts and 35mm x 45mm barcode label stickers.
- **Reporting & Business Analytics**: Comprehensive sales, category, profit, and inventory reports with instant PDF/Excel exports.
- **Staff & Permission Control**: Granular role-based access control (Admin, Manager, Cashier, Staff).

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or pnpm

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/MD-ARIF-UDDIN/BlueDream.git
   cd BlueDream
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Copy `.env.example` to `.env.local` and add your Supabase credentials:
   ```bash
   cp .env.example .env.local
   ```

4. Start Development Server:
   ```bash
   npm run dev
   ```

5. Build for Production:
   ```bash
   npm run build
   ```

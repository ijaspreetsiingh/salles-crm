# JASSDBX — Complete Business Suite
## Comprehensive Technical Documentation

**Version:** 1.0  
**Platform:** Frappe Framework + ERPNext + HRMS  
**Technology:** Web-Based Enterprise Resource Planning  
**Last Updated:** 2026  

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Overview](#system-overview)
3. [Sales CRM Module](#sales-crm-module)
4. [Inventory Management](#inventory-management)
5. [Accounts & Billing](#accounts--billing)
6. [Projects & Tasks](#projects--tasks)
7. [HR & Payroll (HRMS)](#hr--payroll-hrms)
8. [Buying & Procurement](#buying--procurement)
9. [Manufacturing](#manufacturing)
10. [Assets Management](#assets-management)
11. [Technical Architecture](#technical-architecture)
12. [Integration & Workflows](#integration--workflows)

---

## Executive Summary

JASSDBX is an integrated enterprise resource planning (ERP) platform built on the Frappe Framework with ERPNext and HRMS. It provides comprehensive business management solutions across sales, inventory, accounting, HR, projects, manufacturing, and asset management.

### Key Highlights:
- **8 Major Applications** with 25+ integrated modules
- **200+ Business Features** covering entire organization
- **100% Web-Based** — No installation required
- **Real-time Tracking** — Automated data synchronization
- **GST Compliant** — Indian tax regulations
- **Scalable Architecture** — From SMB to Enterprise
- **Multi-User Support** — Role-based access control
- **Automated Workflows** — Approval chains and automation

---

## System Overview

### Architecture

```
┌─────────────────────────────────────────────┐
│         JASSDBX Business Suite              │
├─────────────────────────────────────────────┤
│  Frontend: Web-Based UI (HTML/CSS/JS)       │
│  Backend: Frappe Framework (Python)         │
│  Database: PostgreSQL                       │
│  Cache: Redis                               │
│  Queue: RabbitMQ                            │
└─────────────────────────────────────────────┘
```

### Core Technologies
- **Framework:** Frappe (Python-based ERP framework)
- **Base ERP:** ERPNext (Business modules)
- **HR Module:** Frappe HRMS (Complete HR management)
- **Database:** PostgreSQL (Relational database)
- **Cache:** Redis (In-memory caching)
- **Frontend:** Responsive Web UI
- **Deployment:** Docker containers

### Supported Browsers
- Chrome/Chromium (Latest)
- Firefox (Latest)
- Safari (Latest)
- Edge (Latest)

---

# Sales CRM Module

## Overview
Complete customer relationship management system designed for sales teams to manage leads, deals, customers, and sales orders from initial contact to final invoice.

## Module 1: Lead Management

### Purpose
Capture, track, and nurture sales leads from various sources, qualify them, and convert them into customers.

### Key Features

#### 1.1 Lead Creation & Capture
- **What:** Create new lead records with prospect information
- **How:** Click "New Lead" → Enter details → Save
- **Fields:**
  - Lead Name (contact person)
  - Company Name
  - Email address (with validation)
  - Phone number (multiple numbers supported)
  - Lead Source (dropdown: Website, Referral, Cold Call, Event, Social Media, Walk-in, Other)
  - Lead Owner (sales team member assignment)
  - Date of Creation (auto-populated)

#### 1.2 Lead Status Workflow
- **Purpose:** Track lead progression through sales pipeline
- **Statuses:**
  - **New:** Recently added lead, not contacted yet
  - **Contacted:** Initial contact made, conversation started
  - **Qualified:** Lead meets qualification criteria, strong potential
  - **Converted:** Lead converted to customer + deal
  - **Lost:** Deal lost, with reasons documented

#### 1.3 Lead Source Tracking
- **What:** Record where lead came from
- **Why:** Measure marketing effectiveness, ROI by channel
- **Options:** Website, Referral, Cold Call, Event, Social Media, Walk-in, Other
- **Benefit:** Identify most productive lead sources

#### 1.4 Lead Scoring & Qualification
- **What:** Automatic qualification based on criteria
- **Criteria:** Email domain, company size, engagement level
- **Scoring:** Points-based system (1-100)
- **Benefit:** Prioritize high-value leads

#### 1.5 Lead to Customer Conversion
- **What:** One-click conversion from lead to customer
- **Process:** 
  1. Click "Convert" button on lead
  2. System creates new customer record
  3. Automatically creates first deal
  4. Marks lead as "Converted"
- **Benefit:** Time-saving, automated process

#### 1.6 Lead History & Timeline
- **What:** Complete activity log for each lead
- **Includes:** 
  - Status changes with timestamps
  - Communication history
  - Call logs
  - Email interactions
  - Document attachments
- **Benefit:** Full lead journey visibility

#### 1.7 Lead Assignment
- **What:** Assign leads to sales team members
- **Why:** Distribute workload, ownership tracking
- **Auto-assignment:** Can be based on territory or team
- **Manual Override:** Manager can reassign anytime

### Data Model: Lead Record

```
Lead Record Structure:
├── Basic Information
│   ├── Lead ID (Auto-generated)
│   ├── Lead Name (Person)
│   ├── Company Name
│   ├── Email Address
│   ├── Phone Number
│   └── Alternate Phone
├── Classification
│   ├── Lead Source
│   ├── Lead Status
│   ├── Industry Type
│   └── Company Size
├── Assignment
│   ├── Lead Owner
│   ├── Territory
│   └── Priority (Low/Medium/High)
├── Tracking
│   ├── Created Date
│   ├── Last Modified Date
│   ├── Created By
│   └── Modified By
└── Additional
    ├── Notes/Comments
    ├── Attachments
    └── Contact Preference
```

---

## Module 2: Deals Pipeline

### Purpose
Visualize and manage all active sales deals through different stages, track deal values, and forecast revenue.

### Key Features

#### 2.1 Five-Stage Pipeline
- **Stage 1: Qualification**
  - Initial assessment of lead fit
  - Requirements gathering
  - Budget confirmation
  - Timeline discussion
  - Success Criteria: Decision maker identified

- **Stage 2: Proposal**
  - Solution design customized
  - Quotation sent to customer
  - Proposal document shared
  - Meeting scheduled
  - Success Criteria: Proposal accepted in principle

- **Stage 3: Negotiation**
  - Price negotiation ongoing
  - Terms & conditions discussed
  - Technical specifications finalized
  - Contract review in progress
  - Success Criteria: Terms agreed

- **Stage 4: Won**
  - Deal closed successfully
  - Order received from customer
  - Contract signed
  - Payment terms finalized
  - Success Criteria: Sales order created

- **Stage 5: Lost**
  - Deal unsuccessful
  - Reason documented (Budget, Competition, Timing)
  - Lost to: Competitor name tracked
  - Follow-up strategy planned
  - Success Criteria: Archive for analytics

#### 2.2 Kanban Board (Drag & Drop)
- **What:** Visual pipeline with cards
- **How:** Drag deal card between stages
- **Benefit:** Quick status update, visual pipeline
- **Real-time Sync:** All changes reflect immediately

#### 2.3 Deal Value Tracking
- **What:** Financial tracking of each deal
- **Tracked Fields:**
  - Deal Value (₹): Expected revenue
  - Probability (%): Win likelihood
  - Expected Revenue: Value × Probability
  - Closing Date: Target close date
  - Actual Close Date: When won/lost

#### 2.4 Revenue Forecasting
- **What:** Automatic forecast calculation
- **Formula:** Sum of (Deal Value × Probability % / 100) per stage
- **By Stage:** Shows confidence level
- **By Team:** Individual & team forecasts
- **By Month:** Revenue projection timeline

#### 2.5 Deal Analytics
- **Average Deal Size:** Total value / number of deals
- **Win Rate:** Won deals / Total deals × 100
- **Pipeline Health:** Deal distribution across stages
- **Sales Cycle Length:** Average days to close
- **Lost Deal Analysis:** Reasons for loss tracking

#### 2.6 Deal History & Notes
- **Activity Log:** All changes timestamped
- **Communication Log:** Calls, emails, meetings
- **Document Attachments:** Proposals, contracts
- **Internal Notes:** Team collaboration
- **Modification Trail:** Who changed what, when

#### 2.7 Deal Ownership & Assignment
- **Deal Owner:** Primary sales rep
- **Observers:** Team members tracking deal
- **Stakeholders:** Multiple can collaborate
- **Comments:** Team discussion thread

### Data Model: Deal Record

```
Deal Record Structure:
├── Basic Information
│   ├── Deal ID (Auto-generated)
│   ├── Deal Title/Name
│   ├── Customer Name (linked)
│   ├── Deal Value (₹)
│   └── Currency (INR)
├── Pipeline Status
│   ├── Current Stage (5 options)
│   ├── Stage Change Date
│   ├── Win Probability (0-100%)
│   ├── Expected Revenue (Calculated)
│   └── Lost Reason (if lost)
├── Timeline
│   ├── Deal Created Date
│   ├── Expected Closing Date
│   ├── Actual Closing Date
│   └── Days in Each Stage
├── Assignment
│   ├── Deal Owner (Sales Rep)
│   ├── Territory
│   ├── Team Lead
│   └── Observers (Multiple)
└── Metadata
    ├── Notes & Comments
    ├── Attachments
    ├── Activity Log
    └── Last Modified
```

---

## Module 3: Customer Master

### Purpose
Centralized database of all customers with complete information, communication history, and transaction records.

### Key Features

#### 3.1 Customer Profile Creation
- **What:** Complete customer record with company details
- **Required Fields:**
  - Customer Name (company name)
  - Customer Type (B2B, B2C, Distributor, Reseller)
  - Industry (dropdown: IT, Manufacturing, Retail, etc.)
  - Company Registration Number
  - Tax ID / GST Registration Number

#### 3.2 Multiple Contact Persons
- **Purpose:** Track different contacts within customer
- **Fields per Contact:**
  - Contact Person Name
  - Designation/Title
  - Email Address
  - Direct Phone Number
  - Mobile Number
  - Department
  - Reporting Manager (within customer's org)

#### 3.3 Address Management
- **Billing Address:** For invoicing
  - Street Address Line 1 & 2
  - City, State, PIN Code
  - Country
- **Shipping Address:** For delivery
  - Same structure as billing
  - Can be multiple addresses
- **Customer Type:** Mark as primary/secondary

#### 3.4 Communication History
- **Email Log:** All emails sent/received
- **Call Log:** Call recordings, notes
- **Meeting Notes:** Meeting minutes
- **Chat History:** Internal discussions
- **Document Exchanges:** Quotes, contracts shared

#### 3.5 Customer Segmentation
- **Classification:**
  - A Class: High-value customers (>₹50 Lakhs annual)
  - B Class: Medium-value (₹10-50 Lakhs)
  - C Class: Small-value (<₹10 Lakhs)
- **Purpose:** Prioritize support, pricing
- **Auto-calculated:** Based on annual purchase value

#### 3.6 Purchase History
- **What:** Complete transaction record
- **Shows:**
  - Total invoices created
  - Total amount spent (₹)
  - Number of orders
  - Average order value
  - Last purchase date
  - Most frequently ordered items

#### 3.7 Customer Lifetime Value (CLV)
- **What:** Total expected revenue from customer
- **Calculation:** Sum of all invoices + future expected
- **Used for:** Customer prioritization, retention focus
- **Trend:** Growth over time

#### 3.8 Credit Management
- **Credit Limit:** Maximum allowed outstanding
- **Current Outstanding:** Amount owed
- **Credit Term:** Payment due days (Net 30, Net 60)
- **Alert:** When approaching/exceeding limit

### Data Model: Customer Record

```
Customer Record Structure:
├── Company Information
│   ├── Customer ID (Auto-generated)
│   ├── Customer Name
│   ├── Customer Type (B2B/B2C/Distributor/Reseller)
│   ├── Industry Classification
│   ├── Company Registration No.
│   ├── GST Registration Number
│   ├── PAN Number
│   └── Website URL
├── Contact Persons (Multiple)
│   ├── Contact Name
│   ├── Designation
│   ├── Email
│   ├── Phone
│   ├── Mobile
│   └── Preferred Contact Method
├── Addresses
│   ├── Billing Address (Full)
│   ├── Shipping Address(es) (Multiple)
│   └── Address Type (Primary/Secondary)
├── Commercial Terms
│   ├── Credit Limit (₹)
│   ├── Payment Terms (Net Days)
│   ├── Currency (INR)
│   ├── Price List (if applicable)
│   └── Discount Policy
├── Customer Analytics
│   ├── Total Invoiced (₹)
│   ├── Total Orders (Number)
│   ├── Average Order Value
│   ├── Last Purchase Date
│   ├── Customer Classification (A/B/C)
│   ├── Total Outstanding
│   └── CLV (Customer Lifetime Value)
└── Tracking
    ├── Customer Since (Date)
    ├── Created Date
    ├── Last Modified Date
    └── Activity Timeline
```

---

## Module 4: Selling Module

### Purpose
Complete sales order to invoice workflow with automatic calculations and document generation.

### Key Features

#### 4.1 Item/Product Master
- **What:** Product/service catalog
- **Fields:**
  - Item Code (unique identifier)
  - Item Name
  - Item Category (Product, Service)
  - Unit of Measurement (Nos, Kg, Ltr, Mtr, Box, Hrs, Pcs)
  - HSN Code (for GST)
  - SAC Code (for services)
  - Selling Price (₹)
  - Cost Price (₹)
  - Stock Quantity (current)
  - Reorder Level (auto-order when reached)
  - Supplier List (who supplies)

#### 4.2 Stock Availability Checking
- **What:** Real-time stock verification
- **Check:** Available quantity when adding to order
- **Prevent:** Overselling beyond stock
- **Alert:** Show if stock is low
- **Back-order:** Allow if configured

#### 4.3 Quotation Generation
- **What:** Sales quote for customer
- **Auto-numbering:** QTN-0001, QTN-0002, etc.
- **Valid Till:** Expiry date for quotation
- **Items:** Multi-line items with qty & rate
- **Process:**
  1. Enter customer name
  2. Add items (qty, rate auto-filled from master)
  3. System calculates subtotal
  4. System applies GST @18% (configurable)
  5. Grand total shown
  6. Save & send to customer

#### 4.4 Sales Order from Quotation
- **What:** Create SO from accepted quotation
- **Process:**
  1. Click "Convert to Order" on quotation
  2. New sales order created
  3. Items, quantities copied
  4. Customer notified automatically
  5. Quotation marked "Accepted"
- **Benefit:** One-click conversion

#### 4.5 Sales Invoice Generation
- **What:** Bill to customer
- **From:** Can be created directly or from SO
- **Numbering:** INV-0001, INV-0002, etc.
- **Contents:**
  - Invoice number & date
  - Customer name & address
  - Item details (qty, rate, amount)
  - Subtotal
  - GST calculation (@18% standard)
  - Grand Total
  - Payment terms
  - GSTIN of both buyer & seller

#### 4.6 Automatic GST Calculation
- **What:** Tax calculation automation
- **How:** 
  1. Enter item with qty & rate
  2. System calculates base amount (qty × rate)
  3. Applies GST rate (18% standard)
  4. IGST/CGST/SGST auto-split (if applicable)
  5. Shows taxable & tax amount
- **Configurable:** Per item GST rates (5%, 12%, 18%, 28%)
- **Compliance:** Meets GSTR filing requirements

#### 4.7 Multi-Line Support
- **What:** Add multiple items to single invoice
- **Each Line Contains:**
  - Item name/code
  - Description
  - Quantity
  - Unit
  - Rate (₹)
  - Discount (%)
  - Line Amount
  - Tax info
- **Benefit:** Single invoice, multiple products

#### 4.8 Delivery Note Management
- **What:** Proof of goods delivery
- **Created:** When goods shipped
- **Contains:** Same items as SO
- **Proof:** Signed by customer
- **Tracking:** Against which SO delivered

#### 4.9 Return Order Handling
- **What:** Customer returns management
- **Process:**
  1. Customer initiates return
  2. Create return order (RO)
  3. Goods received back
  4. Credit note issued
  5. Inventory adjusted
  6. Refund processed

### Selling Workflow Diagram

```
Lead → Customer → Deal → Quotation (QTN-001)
                          ↓ (Customer accepts)
                     Sales Order (SO-001)
                          ↓ (Goods packed)
                     Delivery Note
                          ↓ (Goods delivered)
                     Sales Invoice (INV-001)
                          ↓
                     Payment Received
                          ↓
                     Invoice Marked Paid
```

### Data Model: Sales Documents

#### Quotation Record
```
Quotation (QTN-XXXX)
├── Header
│   ├── Quotation No. (QTN-0001)
│   ├── Quotation Date
│   ├── Valid Till Date
│   ├── Customer Name
│   └── Status (Draft/Sent/Accepted/Rejected)
├── Items (Multi-line)
│   ├── Item Name/Code
│   ├── Description
│   ├── Quantity
│   ├── Unit (UOM)
│   ├── Rate (₹)
│   ├── Discount %
│   └── Line Amount
├── Calculations
│   ├── Subtotal (Sum of all line amounts)
│   ├── GST Applicable Yes/No
│   ├── Tax Amount (@18%)
│   └── Grand Total
└── Additional
    ├── Terms & Conditions
    ├── Notes to Customer
    ├── Payment Terms
    └── Delivery Terms
```

#### Sales Order Record
```
Sales Order (SO-XXXX)
├── Header
│   ├── Sales Order No. (SO-0001)
│   ├── Order Date
│   ├── Delivery Date
│   ├── Customer Name
│   ├── Status (Draft/Submitted/Pending/Completed)
│   └── Source Quotation (if from QTN)
├── Items (Same as Quotation)
│   ├── Item Name/Code
│   ├── Ordered Qty
│   ├── Delivered Qty
│   ├── Pending Qty
│   ├── Rate (₹)
│   └── Line Amount
├── Delivery
│   ├── Delivery Address
│   ├── Expected Delivery Date
│   ├── Shipping Method
│   └── Tracking Info (if available)
└── Order Status
    ├── % Delivered
    ├── % Pending
    └── Delivery Timeline
```

#### Sales Invoice Record
```
Sales Invoice (INV-XXXX)
├── Header
│   ├── Invoice No. (INV-0001)
│   ├── Invoice Date
│   ├── Due Date (Payment terms applied)
│   ├── Customer Name & GSTIN
│   ├── Seller GSTIN
│   └── Status (Draft/Submitted/Paid/Cancelled)
├── Items (Multi-line)
│   ├── Item/Product Description
│   ├── HSN/SAC Code
│   ├── Quantity
│   ├── Unit Price
│   ├── Taxable Amount
│   ├── GST Rate (5%/12%/18%/28%)
│   ├── CGST, SGST, IGST (Split)
│   └── Line Total (Inc. Tax)
├── Totals
│   ├── Subtotal (Before Tax)
│   ├── Total GST
│   ├── Grand Total (Inc. Tax)
│   └── Amount in Words (Rupees...)
├── Payment Details
│   ├── Payment Mode
│   ├── Bank Details
│   ├── Payment Status (Unpaid/Partial/Paid)
│   └── Payment Due Date
└── Reference
    ├── Order Reference (SO No.)
    ├── Delivery Note Ref.
    └── Purchase Order Ref. (if applicable)
```

---

# Inventory Management

## Overview
Complete stock management system with multi-warehouse support, real-time tracking, and automated reorder points.

## Module 1: Item Master

### Purpose
Centralized product/service catalog with pricing, costs, and supplier information.

### Key Features

#### 1.1 Item Creation
- **What:** Create new item/product record
- **Basic Info:**
  - Item Code (auto-generated or manual)
  - Item Name
  - Item Group (Electronics, Stationery, etc.)
  - Brand
  - Description
  - Image/Picture

#### 1.2 Classification & Coding
- **Item Group:** Hierarchical categorization
  - Example: Electronics > Computers > Laptops
- **HSN Code:** Harmonized System Nomenclature (for GST)
- **SAC Code:** Service Accounting Code (for services)
- **Item Type:** Product, Service, Raw Material, Semi-finished

#### 1.3 Unit of Measurement (UOM)
- **What:** Standard unit for the item
- **Options:** 
  - Nos (Number/Pieces)
  - Kg (Kilogram)
  - Ltr (Liter)
  - Mtr (Meter)
  - Box
  - Hrs (Hours for services)
  - Pcs (Pieces - alternative)
  - Ton, Gram, Cm, etc.

#### 1.4 Pricing Management
- **Selling Price:** Standard selling rate per unit
- **Cost Price:** Purchase/production cost per unit
- **Profit Margin:** Auto-calculated (Selling - Cost)
- **Discount:** Default discount offered
- **Price Variants:** Different prices for different customers (A/B/C classification)

#### 1.5 Tax Classification
- **GST Rate:** Applicable GST %
  - 5% (Essentials, Food items)
  - 12% (General goods)
  - 18% (Electronics, most items)
  - 28% (Luxury goods)
- **HSN Code:** For GST reporting
- **Exempt:** If GST exempt item
- **Reverse Charge:** If applicable

#### 1.6 Stock Tracking
- **Current Stock:** Available quantity in warehouse
- **Reorder Level:** Minimum stock trigger
- **Reorder Qty:** Quantity to order when stock falls below level
- **Maximum Stock:** Upper limit for inventory
- **Lead Time:** Days to receive from supplier

#### 1.7 Supplier Mapping
- **Primary Supplier:** Main supplier for item
- **Alternate Suppliers:** Backup suppliers
- **Supplier SKU:** Supplier's item code
- **Supplier Rate:** Last known rate from supplier
- **Supplier Details:** Contact, payment terms

#### 1.8 Item Attributes & Variants
- **Attributes:** Size, Color, Configuration, etc.
- **Variants:** Individual SKUs for each combination
- **Parent Item:** Master item
- **Child Items:** Individual variant SKUs

### Data Model: Item Record

```
Item Record Structure:
├── Identification
│   ├── Item Code (Unique)
│   ├── Item Name
│   ├── Item Group (Category)
│   ├── Brand
│   └── Description
├── Classification
│   ├── Item Type (Product/Service/Raw Material)
│   ├── GST Rate (5%/12%/18%/28%)
│   ├── HSN Code
│   ├── SAC Code
│   └── Exemption Status
├── Measurements
│   ├── Unit of Measurement (UOM)
│   ├── Weight (if applicable)
│   ├── Dimensions (L×W×H)
│   └── Volume
├── Pricing
│   ├── Selling Price (₹)
│   ├── Cost Price (₹)
│   ├── Profit Margin %
│   ├── List Price (before discount)
│   └── Discount %
├── Stock Parameters
│   ├── Current Stock (Qty)
│   ├── Reorder Level
│   ├── Reorder Quantity
│   ├── Maximum Stock
│   └── Lead Time (Days)
├── Supplier Info
│   ├── Primary Supplier
│   ├── Alternate Suppliers
│   ├── Supplier SKU
│   └── Last Purchase Rate
└── Tracking
    ├── Created Date
    ├── Last Modified
    ├── Status (Active/Inactive)
    └── Images/Documents
```

---

## Module 2: Warehouse Management

### Purpose
Multi-warehouse inventory tracking with location-based storage and real-time stock levels.

### Key Features

#### 2.1 Multiple Warehouse Support
- **Warehouse Creation:** Define each physical location
- **Warehouse Name:** Identifying name
- **Location:** Address of warehouse
- **Capacity:** Maximum storage capacity
- **Warehouse Manager:** Assigned person
- **Contact Details:** Phone, email

#### 2.2 Real-Time Stock Levels
- **What:** Current available quantity per warehouse
- **Shows:**
  - Total stock quantity
  - Reserved quantity (allocated but not delivered)
  - Available quantity (free to sell)
  - In-transit quantity (ordered from supplier)
  - Defective/Damaged stock
- **Updated:** Automatically with each transaction

#### 2.3 Stock Transfers Between Warehouses
- **What:** Move goods from one warehouse to another
- **Process:**
  1. Create stock transfer request
  2. From warehouse: quantity deducted
  3. To warehouse: quantity added
  4. System tracks in-transit stock
  5. Receives marks items available
- **Cost:** No cost impact (internal transfer)
- **Tracking:** Full transfer history maintained

#### 2.4 Bin/Location Management
- **What:** Specific storage locations within warehouse
- **Structure:**
  - Warehouse > Row > Rack > Shelf > Bin
  - Example: WH-01-R01-K01-S02-B05
- **Benefits:**
  - Quick goods localization
  - FIFO enforcement (First In First Out)
  - Barcode scanning at pickup
- **Barcode:** QR code per bin for scanning

#### 2.5 Stock Aging Report
- **What:** How long items have been in stock
- **Shows:**
  - Quantity by age bracket
  - Cost implications
  - Slow-moving items
  - Dead stock identification
- **Use:** For inventory optimization

#### 2.6 Physical Verification (Stock Count)
- **What:** Physical count vs system count
- **Process:**
  1. Create stock count document
  2. Team does physical counting
  3. Enter actual count in system
  4. System compares with recorded
  5. Adjustments made for variance
- **Frequency:** Annual, quarterly, or as needed
- **Variance Tracking:** Reasons for differences

#### 2.7 Low Stock Alerts & Reorder Automation
- **What:** Automatic notification when stock low
- **Trigger:** Stock reaches reorder level
- **Action:** 
  - Alert to warehouse manager
  - Can auto-create purchase request
  - Pending order list updated
- **Benefit:** Never out of stock

### Data Model: Warehouse & Stock

```
Warehouse Record:
├── Details
│   ├── Warehouse Name
│   ├── Location (Address)
│   ├── Warehouse Manager
│   ├── Contact Details
│   ├── Total Capacity (units)
│   └── Currently Used (%)
├── Stock Items (Linked)
│   ├── Item Code
│   ├── Available Stock (Qty)
│   ├── Reserved Stock
│   ├── In-Transit Stock
│   ├── Defective Stock
│   └── Total Stock
└── Operations
    ├── Bin Layout
    ├── Transfer History
    ├── Stock Verification Schedule
    └── Performance Metrics

Stock Level Record:
├── Item (Link)
├── Warehouse (Link)
├── Available Stock (Qty)
├── Reserved Stock (Qty)
│   └── (Allocated to SOs but not yet delivered)
├── In-Transit Stock (Qty)
│   └── (Ordered from supplier, not yet received)
├── Damaged/Defective (Qty)
├── Total Stock (Qty)
├── Valuation Rate (₹)
├── Stock Value (₹)
│   └── (Qty × Valuation Rate)
└── Last Updated (Timestamp)
```

---

## Module 3: Purchase Management

### Purpose
Supplier order management from RFQ to goods receipt to invoice.

### Key Features

#### 3.1 Supplier Master
- **Supplier Name:** Company name
- **Supplier Type:** Distributor, Manufacturer, Wholesaler
- **Contact Person:** Name and details
- **Email:** For PO communication
- **Phone:** Contact number
- **Address:** Billing address, delivery address
- **GSTIN:** GST number (for compliance)
- **PAN:** Pan number
- **Bank Details:** For payment processing
- **Payment Terms:** Net 30, Net 60, etc.
- **Credit Limit:** Maximum credit extended
- **Rating:** Performance rating (1-5 stars)

#### 3.2 Request for Quotation (RFQ)
- **What:** Send quotation request to suppliers
- **Process:**
  1. Create RFQ
  2. Add items needed with quantities
  3. Specify required date
  4. Send to selected suppliers (email/system)
  5. Suppliers respond with quoted rates
  6. Compare quotations
  7. Select best supplier
- **Benefits:** 
  - Competitive pricing
  - Rate comparison
  - Vendor evaluation

#### 3.3 Purchase Order (PO) Creation
- **What:** Formal order to supplier
- **Auto-numbering:** PO-0001, PO-0002, etc.
- **Contents:**
  - Supplier name
  - Items list (code, description, qty, rate)
  - Total amount
  - Payment terms
  - Delivery address
  - Expected delivery date
  - Terms & conditions
- **Statuses:**
  - Draft: Not yet sent
  - Submitted: Official order
  - Received: Goods received
  - Completed: Invoice received & matched

#### 3.4 Goods Receipt Note (GRN)
- **What:** Document received goods from supplier
- **Created:** When goods arrive at warehouse
- **Process:**
  1. Receive PO items
  2. Quality check performed
  3. Create GRN with accepted quantity
  4. Update warehouse stock
  5. Note any rejections/damage
- **Acceptance Quality:**
  - Quantity match
  - Quality inspection
  - Delivery condition check

#### 3.5 Supplier Invoice Matching (3-Way Match)
- **What:** Match PO, GRN, and Invoice
- **Process:**
  1. **PO Check:** Item, quantity, rate match
  2. **GRN Check:** Goods received matches PO
  3. **Invoice Check:** Supplier invoice matches PO & GRN
  4. **Approval:** If all match, auto-approve
  5. **Alert:** If mismatch, flag for review
- **Benefit:** Fraud prevention, accuracy

#### 3.6 Purchase Invoice Processing
- **What:** Record supplier invoice
- **Contains:**
  - Invoice number & date
  - Supplier name
  - Items (qty, rate, amount)
  - Subtotal, tax, total
  - Due date for payment
- **Processing:**
  - Validation against PO/GRN
  - Tax calculation
  - Accounting entry
  - Payment processing

#### 3.7 Purchase History & Rate Analysis
- **What:** Historical record of purchases
- **Shows:**
  - All past POs to supplier
  - Rates over time (price trends)
  - Quantity ordered & received
  - Quality issues history
  - Payment history
- **Use:** For negotiations, trend analysis

#### 3.8 Return to Supplier
- **What:** Return defective/unwanted goods
- **Process:**
  1. Create return note
  2. Specify return reason (Defective, Wrong item)
  3. Quantity returned
  4. Debit note raised
  5. Inventory adjusted
  6. Credit received from supplier
- **Tracking:** Full return history

### Data Model: Purchase Documents

```
RFQ (Request for Quotation):
├── Header
│   ├── RFQ No. (Auto-generated)
│   ├── RFQ Date
│   ├── Required By Date
│   └── Status (Draft/Sent/Quoted/Ordered/Cancelled)
├── Supplier(s)
│   └── List of suppliers to request quote from
├── Items
│   ├── Item Code
│   ├── Description
│   ├── Quantity Required
│   ├── UOM
│   └── Delivery Address
└── Supplier Responses
    ├── Supplier Name
    ├── Quoted Rate (₹)
    ├── Quoted Quantity
    └── Validity of Quote

Purchase Order (PO):
├── Header
│   ├── PO No. (PO-0001)
│   ├── PO Date
│   ├── Supplier Name
│   ├── Supplier Address
│   ├── Delivery Address
│   ├── Expected Delivery Date
│   └── Status (Draft/Submitted/Received/Completed)
├── Items (Multi-line)
│   ├── Item Code
│   ├── Description
│   ├── Quantity Ordered
│   ├── UOM
│   ├── Rate (₹)
│   └── Line Amount
├── Totals
│   ├── Subtotal
│   ├── Tax/GST
│   └── Total Amount
├── Terms
│   ├── Payment Terms (Net 30/60)
│   ├── Delivery Terms
│   ├── Quality Standards
│   └── Penalties for Delay
└── Tracking
    ├── GRN Received Qty
    ├── Invoice Received
    └── Payment Status

Goods Receipt Note (GRN):
├── Header
│   ├── GRN No. (Auto-generated)
│   ├── Date of Receipt
│   ├── PO Reference
│   ├── Supplier Name
│   └── Status (Draft/Accepted/Partial/Rejected)
├── Items Received
│   ├── Item Code
│   ├── PO Quantity
│   ├── Received Quantity
│   ├── Quality Status (Accepted/Rejected/Hold)
│   └── Remarks (Damage, shortage, etc.)
├── Warehouse Info
│   ├── Receiving Warehouse
│   ├── Bins/Locations assigned
│   └── Stock Updated
└── Signatures
    ├── Received By (Name, Date)
    ├── Checked By (Quality)
    └── Approved By (Manager)

Purchase Invoice:
├── Header
│   ├── Invoice No. (Supplier's invoice number)
│   ├── Invoice Date
│   ├── Supplier Name
│   ├── PO Reference
│   └── Status (Draft/Submitted/Matched/Paid)
├── Items
│   ├── Item Code
│   ├── Description
│   ├── Quantity Invoiced
│   ├── Rate (₹)
│   ├── Line Amount
│   └── GST Details
├── Totals
│   ├── Subtotal
│   ├── GST Amount
│   └── Total Amount
├── Matching Status
│   ├── PO Matched: ✓/✗
│   ├── GRN Matched: ✓/✗
│   ├── 3-Way Match Status
│   └── Variance (if any)
└── Payment
    ├── Due Date
    ├── Payment Terms
    ├── Payment Status
    └── Payment Mode
```

---

## Module 4: Stock Transactions

### Purpose
Track all inventory movements including purchases, sales, transfers, and adjustments.

### Key Features

#### 4.1 Inward Transactions (Purchase Receipt)
- **When:** Goods received from supplier
- **Process:**
  1. Supplier delivers goods
  2. Create inward stock entry
  3. Specify item, quantity, warehouse
  4. Warehouse stock increases
  5. Valuation cost recorded
- **Impact:** Stock ↑, Asset account ↑

#### 4.2 Outward Transactions (Sales Delivery)
- **When:** Goods shipped to customer
- **Process:**
  1. Sales order packed
  2. Create outward delivery note
  3. Specify items & quantity
  4. Stock deducted from warehouse
  5. Customer receives goods
- **Impact:** Stock ↓, Cost of goods sold ↑

#### 4.3 Stock Adjustments
- **When:** Damage, loss, gain, or correction needed
- **Reasons:**
  - **Damage/Breakage:** Item damaged during storage
  - **Loss/Theft:** Unaccounted loss
  - **Gain/Bonus:** Received extra quantity
  - **Error Correction:** System count didn't match physical
- **Process:**
  1. Create adjustment entry
  2. Specify reason
  3. Enter corrected quantity
  4. System adjusts valuation
  5. GL entries created

#### 4.4 Internal Transfers
- **What:** Move goods between warehouses
- **Process:**
  1. Warehouse A: Stock deducted
  2. In-transit: Stock shown in motion
  3. Warehouse B: Stock received
- **Cost:** No accounting impact
- **Tracking:** Full transfer audit trail

#### 4.5 Stock Movement History & Traceability
- **What:** Complete audit trail of every movement
- **Shows:**
  - Date & time of movement
  - From/To location
  - Quantity moved
  - Reason/Reference (PO, SO, Adjustment)
  - User who processed
  - Supporting documents
- **Benefit:** Full traceability for recalls, compliance

#### 4.6 FIFO/LIFO Valuation
- **FIFO (First In First Out):**
  - Older items used first
  - Latest cost for valuation
  - Indian standard
- **LIFO (Last In First Out):**
  - Newest items used first
  - Lower cost in inflation
  - Optional method
- **Valuation Impact:** Affects COGS and profit

#### 4.7 Batch & Serial Number Tracking
- **Batch Number:** For items manufactured together
  - Pharmaceutical products
  - Food items
  - Manufacturing components
- **Serial Number:** Unique identifier per unit
  - Computers, laptops
  - Machinery
  - Assets
- **Tracking:** Which batch/serial to which customer
- **Recall Support:** Trace defective items quickly

### Data Model: Stock Movement Record

```
Stock Entry (Movement):
├── Header
│   ├── Entry No. (Auto-generated)
│   ├── Date & Time
│   ├── Type (Inward/Outward/Transfer/Adjustment)
│   ├── Reference (PO/SO/Manual)
│   └── Reason (if applicable)
├── Source Information
│   ├── From Warehouse (if transfer/outward)
│   ├── From Bin/Location
│   └── Reason Details
├── Item Details
│   ├── Item Code
│   ├── Description
│   ├── Quantity Moved
│   ├── UOM
│   ├── Valuation Rate (₹)
│   └── Transaction Value (Qty × Rate)
├── Destination Information
│   ├── To Warehouse (if transfer/inward)
│   ├── To Bin/Location
│   ├── Batch No. (if applicable)
│   └── Serial No. (if applicable)
├── Warehouse Impact
│   ├── Stock Before (Qty)
│   ├── Stock After (Qty)
│   └── Net Change
└── Audit Trail
    ├── Created By (User)
    ├── Approved By (Manager)
    ├── Supporting Documents
    └── Timestamp
```

---

# Accounts & Billing

## Overview
Complete financial management system with invoicing, expense tracking, GST compliance, and financial reporting.

## Module 1: Sales Invoicing

### Purpose
Generate customer invoices with automatic tax calculation and payment tracking.

### Key Features

#### 1.1 Invoice Creation
- **What:** Bill to customer for delivered goods/services
- **Methods:**
  - Direct invoice creation
  - From sales order (auto-copy items)
  - From delivery note (if goods delivered)
- **Auto-numbering:** INV-0001, INV-0002, etc.
- **Invoice Date:** Date of invoice (usually delivery date)

#### 1.2 Multi-Line Item Support
- **What:** Multiple products/services on one invoice
- **Each Line:**
  - Item code/description
  - Quantity delivered
  - Unit price
  - Discount (if any)
  - Line amount (Qty × Price - Discount)
  - Tax/GST information
- **Add More:** Scroll or button to add more items
- **Remove:** Delete unwanted items

#### 1.3 Automatic GST Calculation
- **How It Works:**
  1. Enter item qty × rate
  2. System shows taxable amount
  3. Applies GST rate (5%, 12%, 18%, or 28%)
  4. Calculates tax amount
  5. Shows CGST/SGST (Intra-state) or IGST (Inter-state)
  6. Adds to total
- **Split (Intra-state):**
  - CGST (Central GST): 50% of rate
  - SGST (State GST): 50% of rate
  - Example: 18% rate → 9% CGST + 9% SGST
- **Split (Inter-state):**
  - IGST (Integrated GST): Full rate
  - Example: 18% rate → 18% IGST

#### 1.4 Subtotal, Tax, Grand Total Automation
- **Subtotal:** Sum of all line amounts (before tax)
  - Formula: SUM(Item 1 Qty × Rate - Discount + Item 2 Qty × Rate - Discount...)
- **Tax Amount:** GST calculation on subtotal
  - Formula: Subtotal × GST% / 100
- **Grand Total:** Subtotal + Tax
  - Formula: Subtotal + Tax Amount

#### 1.5 Invoice Status Tracking
- **Draft:** Incomplete, not sent
- **Submitted:** Official invoice, locked
- **Paid:** Full payment received
- **Cancelled:** Voided/invalid
- **Status Change:** Automatic based on payment received

#### 1.6 Invoice Templates & Customization
- **Standard Template:** Default format
- **Custom Templates:** Company letterhead, logo
- **Customization:**
  - Add company logo
  - Custom fields
  - Terms & conditions
  - Payment instructions
  - Bank details
- **Print Format:** Professional PDF for email/printing

#### 1.7 Tax Compliance Fields
- **Seller GSTIN:** Company GST number
- **Buyer GSTIN:** Customer GST number
- **Invoice Number:** Unique for GST reporting
- **Place of Supply:** For GSTR filing
- **Reverse Charge:** If applicable
- **HSN/SAC Codes:** For each line item

### Data Model: Sales Invoice Record

```
Sales Invoice (INV-XXXX):
├── Document Header
│   ├── Invoice Number (INV-0001)
│   ├── Invoice Date
│   ├── Due Date (Payment terms applied)
│   ├── Posting Date
│   └── Invoice Status (Draft/Submitted/Paid/Cancelled)
├── Customer Information
│   ├── Customer Name (Link to master)
│   ├── Billing Address
│   ├── Shipping Address
│   ├── Customer GSTIN
│   ├── Customer Email
│   └── Customer Contact
├── Items Section (Multi-line)
│   ├── Item Code
│   ├── Item Description
│   ├── HSN/SAC Code
│   ├── Unit of Measurement
│   ├── Quantity
│   ├── Unit Price (₹)
│   ├── Line Discount (%)
│   ├── Taxable Amount (Qty × Price - Discount)
│   ├── GST Rate (5%/12%/18%/28%)
│   ├── CGST Amount
│   ├── SGST Amount
│   ├── IGST Amount
│   └── Total Amount per Line (Inc. Tax)
├── Summary
│   ├── Subtotal (Sum of taxable amounts)
│   ├── Total GST (Sum of all taxes)
│   │   ├── Total CGST
│   │   ├── Total SGST
│   │   └── Total IGST
│   ├── Grand Total (Subtotal + GST)
│   └── Amount in Words (Rupees Fifty Thousand...)
├── Tax Details (for GST)
│   ├── Place of Supply
│   ├── Reverse Charge Applicable (Yes/No)
│   ├── Seller GSTIN
│   ├── Buyer GSTIN
│   └── Invoice Type (Regular/Bill of Supply)
├── Payment Terms
│   ├── Payment Mode (Cash/Cheque/Bank Transfer/Card)
│   ├── Due Date
│   ├── Payment Terms (Net 30/60)
│   ├── Early Payment Discount (if any)
│   └── Late Payment Interest (if any)
├── Banking Details
│   ├── Bank Name
│   ├── Account Number
│   ├── IFSC Code
│   └── Account Type (Checking/Savings)
├── References
│   ├── Sales Order Reference (SO-XXXX)
│   ├── Delivery Note Reference
│   ├── PO from Customer (if applicable)
│   └── Project Reference (if applicable)
├── Notes
│   ├── Terms & Conditions
│   ├── Payment Instructions
│   ├── Notes to Customer
│   └── Legal Notices
└── Tracking
    ├── Created Date
    ├── Created By
    ├── Last Modified Date
    ├── Modified By
    └── Audit Trail
```

---

## Module 2: Expense Tracking

### Purpose
Record and categorize employee business expenses for reimbursement.

### Key Features

#### 2.1 Expense Claim Creation
- **What:** Employee submits expense for reimbursement
- **Who:** Any employee can submit
- **When:** After incurring business expense
- **Submission:** Online form with receipt upload

#### 2.2 Expense Categorization
- **Categories:**
  - **Travel:** Flight, train, taxi, parking
  - **Meals:** Client dinners, team meals, restaurant
  - **Office Supplies:** Stationery, equipment
  - **Hotel:** Accommodation during travel
  - **Communication:** Phone, data charges
  - **Utilities:** Office utilities, internet
  - **Client Entertainment:** Client dinners, gifts
  - **Miscellaneous:** Other business expenses
- **Budget Control:** Can set budget per category
- **Spend Limit:** Daily limit to prevent misuse

#### 2.3 Receipt Upload & Documentation
- **What:** Supporting documentation
- **Upload:** Receipt image/PDF from mobile/desktop
- **OCR Support:** Auto-extract amount & date from receipt
- **Multiple Receipts:** Can attach several for one expense
- **Validation:** System checks receipt date matches claim date

#### 2.4 Approval Workflow
- **Flow:**
  1. **Employee:** Submits expense claim
  2. **Manager:** Receives notification, reviews
  3. **Manager Actions:**
     - Approve (proceed to finance)
     - Reject (ask employee for details)
     - Query (ask for clarification)
  4. **Finance:** Reviews approved expenses
  5. **Finance Actions:**
     - Approve for payment
     - Hold for investigation
     - Reject with reason
  6. **Payment:** Reimbursement processed
- **Notifications:** Email at each stage

#### 2.5 Expense Reimbursement Processing
- **What:** Returning money to employee
- **Process:**
  1. Expense approved
  2. Calculate reimbursement amount
  3. Process through payroll
  4. Amount added to next salary
  5. Or direct bank transfer (if policy allows)
- **Frequency:** Monthly with salary or on-demand

#### 2.6 Monthly Expense Summary Reports
- **Report Shows:**
  - Employee name
  - Total claims submitted
  - Total approved amount
  - Total rejected amount
  - Pending amount (awaiting approval)
  - By category breakdown
  - By month comparison
- **Export:** Can export to Excel/PDF

#### 2.7 Vendor Bill Management
- **What:** Track supplier/vendor bills
- **Vendor Bill Record:**
  - Vendor name
  - Bill amount
  - Description of service/goods
  - Payment status
  - Due date
  - Payment method
- **Approval:** Manager approval required before payment

### Data Model: Expense Records

```
Expense Claim:
├── Header
│   ├── Claim ID (Auto-generated)
│   ├── Employee Name
│   ├── Employee ID
│   ├── Claim Date
│   ├── Submitted Date
│   └── Status (Draft/Submitted/Approved/Rejected/Paid)
├── Expenses (Multi-line)
│   ├── Expense Date
│   ├── Category (Travel/Meals/Office/etc.)
│   ├── Description
│   ├── Amount (₹)
│   ├── Tax/GST (if applicable)
│   ├── Receipt Uploaded (Yes/No)
│   └── Approval Status (Pending/Approved/Rejected)
├── Totals
│   ├── Subtotal (Sum of all expenses)
│   ├── Total Tax/GST
│   └── Total Reimbursement Amount
├── Approvals
│   ├── Manager Approval (Name, Date, Comments)
│   ├── Finance Approval (Name, Date, Comments)
│   └── Approval Status (Approved/Pending/Rejected)
├── Reimbursement
│   ├── Reimbursement Method (Payroll/Bank Transfer)
│   ├── Processing Date
│   ├── Payment Status (Pending/Processed/Completed)
│   └── Reference No. (If bank transfer)
└── Audit Trail
    ├── Created By
    ├── Submitted By
    ├── Approved By
    └── Paid By

Vendor Bill:
├── Header
│   ├── Bill ID
│   ├── Vendor Name (Link to supplier master)
│   ├── Bill Date
│   ├── Bill Number (from vendor)
│   └── Bill Status
├── Details
│   ├── Description (Service/Goods provided)
│   ├── Bill Amount (₹)
│   ├── GST (if applicable)
│   ├── Total Amount Due
│   └── Currency
├── Payment Details
│   ├── Due Date
│   ├── Terms (Net 30/60)
│   ├── Discount Offered (if any)
│   └── Late Payment Interest
├── Approval
│   ├── Approver Name
│   ├── Approval Date
│   └── Approval Comments
└── Payment
    ├── Payment Mode
    ├── Payment Date
    ├── Payment Amount
    └── Payment Reference
```

---

## Module 3: Payment & Collections

### Purpose
Track customer receivables, manage payment receipts, and aging reports.

### Key Features

#### 3.1 Payment Receipt Creation
- **What:** Record customer payment received
- **Methods Accepted:**
  - **Cash:** Physical money
  - **Cheque:** Cheque from customer
  - **Bank Transfer:** Online/NEFT/RTGS
  - **Card:** Credit/debit card payment
  - **Digital Wallet:** UPI, Google Pay, PayTM
- **Receipt:** Auto-generated receipt number

#### 3.2 Invoice Payment Reconciliation
- **What:** Match payment to invoice
- **Process:**
  1. Payment received
  2. Link to invoice
  3. Amount verified
  4. Payment status updated
  5. Invoice marked "Paid"
- **Partial Payments:** Can link multiple payments to one invoice

#### 3.3 Outstanding Receivables Aging Report
- **What:** Shows how old unpaid invoices are
- **Buckets:**
  - **Current:** Due within 30 days
  - **30+ Days:** 31-60 days overdue
  - **60+ Days:** 61-90 days overdue
  - **90+ Days:** More than 90 days overdue
- **Action:** Follow-up priority based on age
- **Total Outstanding:** Sum of all unpaid invoices

#### 3.4 Payment Due Date Tracking
- **What:** Automatic tracking of payment due dates
- **Notification:**
  - Due tomorrow: Reminder email
  - Overdue: Escalation alert
  - Seriously overdue (30+ days): Management alert
- **Customer View:** Customer can see their outstanding

#### 3.5 Partial Payment Support
- **What:** Pay part of invoice, rest later
- **Example:**
  - Invoice: ₹1,00,000
  - Payment 1: ₹30,000 (Partial)
  - Remaining: ₹70,000
  - Payment 2: ₹70,000 (Full settlement)
- **Tracking:** Shows payment schedule

#### 3.6 Payment Term Management
- **What:** Define when payment is due
- **Options:**
  - **Net 0:** Payment immediately (COD)
  - **Net 15:** Due within 15 days
  - **Net 30:** Due within 30 days
  - **Net 60:** Due within 60 days
  - **Net 90:** Due within 90 days
  - **2/10 Net 30:** 2% discount if paid within 10 days
- **Default:** Can set default per customer
- **Invoice-wise Override:** Can change per invoice

#### 3.7 Collections Management
- **What:** Track collection activities
- **Process:**
  1. Invoice overdue
  2. Auto-generate collection call/email
  3. Record collection activity
  4. Note customer response
  5. Schedule follow-up
  6. Track success rate
- **Collection Status:**
  - Called/Not answered
  - Payment promised
  - Payment received
  - Dispute raised
  - Default/Legal action

### Data Model: Payment & Collections Records

```
Payment Receipt:
├── Header
│   ├── Receipt Number (Auto-generated)
│   ├── Receipt Date
│   ├── Payment Date
│   ├── Customer Name
│   └── Receipt Status (Draft/Submitted/Reconciled)
├── Payment Details
│   ├── Payment Mode (Cash/Cheque/Bank/Card/UPI)
│   ├── Amount Received (₹)
│   ├── Currency
│   ├── Cheque Number (if cheque)
│   ├── Bank Name (if bank transfer)
│   ├── Reference Number
│   └── Payment Remarks
├── Invoice(s) Linked
│   ├── Invoice Number
│   ├── Invoice Amount
│   ├── Amount Received Against
│   ├── Remaining Balance
│   └── Payment Status (Full/Partial/Pending)
├── Bank Details
│   ├── Bank Account Credited
│   ├── Date Credited
│   └── Clearance Status (for cheques)
└── Audit Trail
    ├── Received By
    ├── Verified By
    ├── Reconciled By
    └── Timestamp

Outstanding Receivables Record:
├── Customer Information
│   ├── Customer Name
│   ├── Customer ID
│   ├── Contact Person
│   └── Phone/Email
├── Outstanding Invoices
│   ├── Invoice Number
│   ├── Invoice Date
│   ├── Invoice Amount
│   ├── Amount Paid
│   ├── Outstanding Amount
│   ├── Days Overdue
│   └── Overdue Status (Current/30+/60+/90+)
├── Totals
│   ├── Total Outstanding (₹)
│   ├── Total Current
│   ├── Total 30+ Days Overdue
│   ├── Total 60+ Days Overdue
│   └── Total 90+ Days Overdue
├── Customer Credit
│   ├── Credit Limit
│   ├── Current Outstanding
│   ├── Available Credit
│   └── Credit Utilization %
└── Collection History
    ├── Last Payment Date
    ├── Collection Calls Made
    ├── Collection Status
    └── Next Follow-up Date

Payment Terms Record:
├── Term Name
│   ├── Example: "Net 30"
├── Days from Invoice
│   ├── Example: 30
├── Discount
│   ├── Early Discount % (if applicable)
│   ├── Days for discount (if applicable)
│   └── Discount Amount (calculated)
├── Late Payment Interest
│   ├── Interest Rate % per month
│   ├── Applicable after: N days overdue
│   └── Interest Amount (calculated)
└── Description
    └── Full description of term
```

---

## Module 4: Financial Reports

### Purpose
Generate financial statements and business analysis reports.

### Key Features

#### 4.1 Profit & Loss (P&L) Statement
- **What:** Shows company's profitability
- **Period:** Monthly, quarterly, yearly
- **Components:**
  - **Revenue:**
    - Sales (from invoices)
    - Other income
    - Total Income
  - **Cost of Goods Sold (COGS):**
    - Opening stock
    - Plus: Purchases
    - Less: Closing stock
    - COGS
  - **Gross Profit:** Revenue - COGS
  - **Operating Expenses:**
    - Salaries
    - Rent
    - Utilities
    - Marketing
    - Depreciation
    - Administrative
    - Total Expenses
  - **Operating Profit:** Gross Profit - Operating Expenses
  - **Non-Operating Items:**
    - Interest paid
    - Other expenses
  - **Net Profit:** Operating Profit - Other Items
- **Format:** Standard accounting format
- **Comparison:** Year-on-year, month-on-month

#### 4.2 Balance Sheet
- **What:** Financial position of company on specific date
- **Components:**
  - **Assets:**
    - **Current Assets:**
      - Cash & bank
      - Accounts receivable
      - Inventory
    - **Fixed Assets:**
      - Property, plant, equipment
      - Less: Accumulated depreciation
    - **Intangible Assets:**
      - Goodwill, patents
    - **Total Assets**
  - **Liabilities:**
    - **Current Liabilities:**
      - Accounts payable
      - Short-term loans
      - Accrued expenses
    - **Long-term Liabilities:**
      - Long-term loans
      - Deferred tax
    - **Total Liabilities**
  - **Equity:**
    - Capital
    - Retained earnings
    - Total Equity
  - **Check:** Assets = Liabilities + Equity

#### 4.3 Cash Flow Statement
- **What:** Shows movement of cash in and out
- **Periods:** Operating, Investing, Financing activities
- **Components:**
  - **Operating Activities:**
    - Net profit
    - Add back: Depreciation
    - Working capital changes
    - Cash from operations
  - **Investing Activities:**
    - Purchase of assets
    - Sale of assets
    - Cash from/to investing
  - **Financing Activities:**
    - Loans received/repaid
    - Dividends paid
    - Cash from/to financing
  - **Net Cash Movement:** Operating + Investing + Financing
  - **Opening Cash:** Previous period
  - **Closing Cash:** Opening + Net movement

#### 4.4 Trial Balance & General Ledger
- **Trial Balance:**
  - Lists all accounts
  - Shows debit and credit balances
  - Check: Total debits = Total credits
  - Used for error finding
- **General Ledger:**
  - Full detail of each account
  - All transactions posted
  - Running balance
  - For audit trail

#### 4.5 GST Summary
- **What:** Tax amounts for GST return filing
- **Components:**
  - **CGST (Central GST):** Central government tax collected
  - **SGST (State GST):** State government tax collected
  - **IGST (Integrated GST):** For inter-state sales
  - **Input Tax Credit:** Tax on purchases
  - **Net GST Payable:** Output tax - Input tax credit
  - **Tax Rate Summary:** 5%, 12%, 18%, 28% wise breakdown
- **Period:** Monthly/quarterly for GSTR filing
- **Used For:** GSTR-1, GSTR-2, GSTR-3B filing

#### 4.6 Revenue by Customer Analysis
- **What:** Sales analysis by customer
- **Shows:**
  - Customer name
  - Total sales value
  - Number of orders
  - Average order value
  - % of total revenue
  - Growth trend (vs last period)
- **Ranking:** Top 10, 20 customers
- **Trend:** Sales over time per customer

#### 4.7 Expense Breakdown by Category
- **What:** Analysis of expenses
- **Categories:**
  - Salaries & wages
  - Rent & utilities
  - Office supplies
  - Marketing
  - Transportation
  - Depreciation
  - Interest
  - Other
- **Shows:** Amount, % of total, trend
- **Budget vs Actual:** Compare with budget

### Data Model: Financial Report Records

```
P&L Statement Record:
├── Header
│   ├── Report Period (From Date - To Date)
│   ├── Company Name
│   ├── Currency (INR)
│   └── Comparison Period (optional)
├── Revenue Section
│   ├── Sales Revenue (₹)
│   ├── Other Income
│   └── Total Income
├── Cost of Goods Sold
│   ├── Opening Stock
│   ├── Plus: Purchases
│   ├── Less: Closing Stock
│   └── Cost of Goods Sold
├── Gross Profit
│   └── Gross Profit (%) = (Revenue - COGS) / Revenue × 100
├── Operating Expenses
│   ├── Salary Expense
│   ├── Rent Expense
│   ├── Utilities Expense
│   ├── Marketing Expense
│   ├── Depreciation Expense
│   ├── Administrative Expense
│   └── Total Operating Expense
├── Operating Profit
│   └── EBIT = Gross Profit - Operating Expense
├── Non-Operating Items
│   ├── Interest Expense
│   ├── Other Expense
│   └── Non-Operating Total
├── Net Profit
│   └── Net Profit = Operating Profit - Non-Operating Items
├── Net Profit %
│   └── (Net Profit / Total Income) × 100
└── Comparisons (if multi-period)
    ├── Prior Period Amounts
    ├── Variance (₹)
    └── Variance (%)

Balance Sheet Record:
├── Header
│   ├── As on Date
│   ├── Company Name
│   └── Currency (INR)
├── Assets
│   ├── Current Assets
│   │   ├── Cash & Bank Balance
│   │   ├── Accounts Receivable
│   │   ├── Inventory
│   │   ├── Prepaid Expenses
│   │   └── Other Current Assets
│   ├── Fixed Assets
│   │   ├── Land & Building
│   │   ├── Machinery & Equipment
│   │   ├── Furniture & Fixtures
│   │   ├── Vehicles
│   │   ├── Less: Accumulated Depreciation
│   │   └── Net Fixed Assets
│   ├── Intangible Assets
│   │   ├── Goodwill
│   │   ├── Patents
│   │   └── Other Intangibles
│   └── Total Assets
├── Liabilities
│   ├── Current Liabilities
│   │   ├── Accounts Payable
│   │   ├── Short-term Debt
│   │   ├── Accrued Expenses
│   │   ├── Current Tax Payable
│   │   └── Other Current Liabilities
│   ├── Long-term Liabilities
│   │   ├── Long-term Debt
│   │   ├── Deferred Tax Liability
│   │   └── Other Long-term Liabilities
│   └── Total Liabilities
├── Equity
│   ├── Share Capital
│   ├── Retained Earnings
│   ├── Reserves
│   └── Total Equity
└── Verification
    └── Total Assets = Total Liabilities + Total Equity ✓

Cash Flow Statement Record:
├── Header
│   ├── Report Period (From Date - To Date)
│   ├── Company Name
│   └── Currency (INR)
├── Operating Activities
│   ├── Net Income
│   ├── Add Back: Depreciation
│   ├── Working Capital Changes
│   │   ├── (Increase)/Decrease in AR
│   │   ├── (Increase)/Decrease in Inventory
│   │   ├── Increase/(Decrease) in AP
│   │   └── Other WC Changes
│   └── Net Cash from Operations
├── Investing Activities
│   ├── (Purchase) of Fixed Assets
│   ├── Sale of Fixed Assets
│   ├── (Investment) in Subsidiaries
│   └── Net Cash from Investing
├── Financing Activities
│   ├── Loan Proceeds
│   ├── Loan Repayment
│   ├── Dividend Payment
│   ├── Share Capital Raised
│   └── Net Cash from Financing
├── Net Change in Cash
│   └── = Operating + Investing + Financing
├── Opening Cash Balance
├── Closing Cash Balance
└── Reconciliation
    └── Opening + Net Change = Closing ✓
```

---

## Module 5: GST Compliance

### Purpose
Automated GST calculation and compliance reporting for Indian tax regulations.

### Key Features

#### 5.1 GST Rate Selection
- **Applicable Rates:**
  - **5% GST:** Food items, basic goods, books
  - **12% GST:** General goods, electronics
  - **18% GST:** Most goods and services
  - **28% GST:** Luxury items, expensive goods
  - **0% (Exempt):** Services like education, health
- **Per Item:** Rate assigned to each item
- **Override:** Can override rate per invoice
- **Validation:** System checks for correct rate

#### 5.2 HSN/SAC Code Mapping
- **HSN Code:** Harmonized System of Nomenclature
  - Used for goods
  - 6-digit code
  - Determines GST eligibility
  - Example: 8471 (Automatic data processing machines)
- **SAC Code:** Service Accounting Code
  - Used for services
  - 6-digit code
  - Example: 998531 (Rent-a-cab operations)
- **Mapping:** Each item has HSN/SAC code
- **Validation:** Must be valid code

#### 5.3 IGST/CGST/SGST Auto-Split
- **When Intra-State (same state):**
  - GST split into CGST & SGST equally
  - 18% → 9% CGST + 9% SGST
  - 12% → 6% CGST + 6% SGST
  - 5% → 2.5% CGST + 2.5% SGST
- **When Inter-State (different state):**
  - GST applied as IGST fully
  - 18% → 18% IGST (no split)
  - 12% → 12% IGST
  - 5% → 5% IGST
- **Determination:** Based on supplier & customer state
- **Auto-Applied:** System calculates automatically

#### 5.4 GST Summary for GSTR Returns
- **What:** Consolidated GST data for filing
- **Information Provided:**
  - Total sales by rate (5%, 12%, 18%, 28%)
  - CGST, SGST, IGST collected (by rate)
  - CGST, SGST, IGST paid (on purchases)
  - Net GST payable/receivable
  - B2B sales (to registered businesses)
  - B2C sales (to consumers)
  - Export sales (0% GST)
- **Period:** Monthly/Quarterly
- **Used For:** GSTR-1 filing

#### 5.5 GSTR-1, GSTR-2 Readiness
- **GSTR-1:**
  - Outward supplies (sales)
  - Filed by seller
  - Shows all customers & amounts
  - System generates export file
- **GSTR-2 (Now GSTR-2A):**
  - Inward supplies (purchases)
  - Auto-populated from seller's GSTR-1
  - Buyer matches received data
  - Accepts/rejects purchases
- **System:** Exports in GSTR-approved format

#### 5.6 Tax Liability Calculation
- **What:** How much GST to pay to government
- **Formula:**
  - GST Collected (from customers)
  - Less: GST Paid (on purchases)
  - = Net GST Payable (to government)
- **Due Date:** Monthly (after 20th of month)
- **Payment:** Via GSTR-3B filing

#### 5.7 Input Tax Credit (ITC) Tracking
- **What:** Tax paid on purchases that can be claimed back
- **Eligible:** Business-related purchases with GST
- **Not Eligible:** Personal expenses, fuel, vehicle use
- **Claim:** In GSTR-3B filed monthly
- **Benefit:** Reduces GST payable to government
- **Audit:** System tracks for compliance

### Data Model: GST Compliance Records

```
GST Registration Record:
├── Company Information
│   ├── Company Name
│   ├── GSTIN (Unique 15-digit identifier)
│   ├── PAN (Permanent Account Number)
│   ├── State of Registration
│   ├── Registration Type (Regular/Composition/Exempt)
│   └── Registration Date
├── GST Liability
│   ├── Tax Period (Monthly)
│   ├── GST Collected (Output Tax)
│   │   ├── CGST Collected
│   │   ├── SGST Collected
│   │   ├── IGST Collected
│   │   └── Total Output Tax
│   ├── GST Paid (Input Tax)
│   │   ├── CGST Paid
│   │   ├── SGST Paid
│   │   ├── IGST Paid
│   │   └── Total Input Tax
│   └── Net GST Payable = Output - Input
├── GSTR Filing
│   ├── GSTR-1 Filed (Yes/No, Date)
│   ├── GSTR-2A Received
│   ├── GSTR-3B Filed (Yes/No, Date)
│   ├── Payment Made (Yes/No, Amount)
│   └── Payment Date
└── Compliance Status
    ├── All Returns Filed (On Time/Late/Pending)
    └── Payment Status (Paid/Pending)

Item GST Settings:
├── Item Details
│   ├── Item Code
│   ├── Item Name
│   └── HSN Code (for goods)
├── GST Configuration
│   ├── Applicable GST Rate (5%/12%/18%/28%)
│   ├── Is Service (Yes/No)
│   └── SAC Code (if service)
├── Tax Jurisdiction
│   ├── Tax Category (Goods/Services)
│   ├── Intra-State GST Treatment
│   ├── Inter-State GST Treatment
│   └── Export GST Treatment (0%)
└── Special Cases
    ├── Reverse Charge Applicable (Yes/No)
    ├── GST Exemption (Yes/No)
    └── Notes
```

---

## Module 6: Chart of Accounts

### Purpose
General ledger and account structure for financial record-keeping.

### Key Features

#### 6.1 Account Head Creation
- **What:** Define financial accounts
- **Account Types:**
  - **Assets:** Things company owns
    - Current: Cash, receivables, inventory
    - Fixed: Land, building, machinery
  - **Liabilities:** Things company owes
    - Current: Payables, short-term loans
    - Long-term: Long-term loans, mortgages
  - **Income:** Money coming in
    - Sales revenue
    - Other income
  - **Expenses:** Money going out
    - COGS, salaries, rent, utilities
  - **Equity:** Owner's stake
    - Capital, retained earnings
- **Account Name:** Descriptive name
- **Account Code:** Unique identifier

#### 6.2 Account Code & Hierarchical Structure
- **Hierarchy Example:**
  ```
  1000 Assets
  ├─ 1100 Current Assets
  │  ├─ 1110 Cash
  │  ├─ 1120 Bank
  │  └─ 1130 Receivables
  └─ 1200 Fixed Assets
     ├─ 1210 Land
     ├─ 1220 Building
     └─ 1230 Machinery
  ```
- **Benefit:** Easy organization and reporting
- **Parent-Child:** Accounts nest under parent accounts

#### 6.3 Manual Journal Entry Creation
- **What:** Record transactions manually
- **When Used:**
  - Adjusting entries
  - Corrections
  - Accruals
  - Depreciation
- **Entry Contains:**
  - Date of entry
  - Description/narration
  - Multiple account lines

#### 6.4 Debit/Credit Posting & Validation
- **Double-Entry System:**
  - Every transaction has debit & credit
  - Debit = what account receives
  - Credit = what account gives
  - Debits must equal credits
- **Validation:** System checks balance before posting
- **Example:**
  ```
  Sales Invoice ₹10,000:
  Dr. Cash         ₹10,000
  Cr. Sales Income           ₹10,000
  ```

#### 6.5 Account Reconciliation
- **What:** Match GL account with source documents
- **Process:**
  1. Take GL balance
  2. Match with bank statements (for cash)
  3. Match with customer statements (for receivables)
  4. Identify differences
  5. Make adjustment entries
- **Frequency:** Monthly for active accounts
- **Benefit:** Finds errors, fraud

#### 6.6 Account History & Audit Trail
- **What:** Complete history of account
- **Shows:**
  - All transactions affecting account
  - Date and amount of each
  - User who entered
  - Supporting documents
  - Timestamp
- **Immutable:** Cannot be changed once posted
- **Audit Support:** Full traceability for auditors

#### 6.7 Opening Balance Entry
- **What:** Initial balance when starting new fiscal year
- **Process:**
  1. Get previous year closing balances
  2. Create opening entry
  3. Post to all accounts
  4. Verify total debits = total credits
- **Timing:** First day of fiscal year
- **Check:** Opening balance = Previous closing balance

---

# Projects & Tasks

## Overview
Project management with task tracking, time logging, and resource allocation.

## Module 1: Project Management

### Purpose
Create and manage projects with timelines, milestones, and progress tracking.

### Key Features

#### 1.1 Project Creation
- **What:** Create new project record
- **Basic Information:**
  - Project Name
  - Project Manager (assigned person)
  - Description of project
  - Project Status (Planning, In Progress, On Hold, Completed, Cancelled)
  - Start Date
  - End Date (expected completion)
  - Category (Service project, Construction, IT, etc.)

#### 1.2 Project Status Workflow
- **Planning:** Project defined, planning phase
- **In Progress:** Active project, work ongoing
- **On Hold:** Temporarily paused
- **Completed:** All work done
- **Cancelled:** Project terminated
- **Status Changes:** Automatic or manual

#### 1.3 Project Owner & Team Assignment
- **Project Owner:** Final decision maker
- **Project Manager:** Daily operations
- **Team Members:** Do the work
  - Can assign multiple members
  - Different roles (Developer, Designer, QA, etc.)
  - Percentage allocation (50%, 100%, etc.)

#### 1.4 Budget Allocation per Project
- **What:** Financial budget for project
- **Budget Amount (₹):** Total allowed spend
- **Breakdown:** By category (Salaries, Materials, Outsourcing)
- **Tracking:** Spending monitored vs budget
- **Alert:** When approaching budget limit

#### 1.5 Project Milestone Creation
- **What:** Major checkpoint in project
- **Milestones Contain:**
  - Milestone name (e.g., "Design Complete", "Testing Start")
  - Target date for completion
  - Key deliverables at this milestone
- **Tracking:** % complete status
- **Critical Milestones:** Mark as critical path

#### 1.6 Project Progress Percentage
- **What:** Overall project completion %
- **Calculated:** Based on task completion
- **Formula:** Completed tasks / Total tasks × 100
- **Milestone Progress:** If milestone has tasks
- **Visual:** Progress bar showing % complete

#### 1.7 Timeline Management
- **Gantt Chart View:** Visual timeline
  - Shows tasks, duration, dependencies
  - Start date, end date
  - Slack time (buffer)
  - Critical path (must-complete items)
- **Timeline Alert:** When behind schedule
- **Adjustment:** Can reschedule if needed

### Data Model: Project Record

```
Project Record:
├── Header
│   ├── Project ID (Auto-generated)
│   ├── Project Name
│   ├── Project Description
│   ├── Project Status (Planning/In Progress/On Hold/Completed/Cancelled)
│   └── Project Category
├── Team & Ownership
│   ├── Project Owner
│   ├── Project Manager
│   ├── Team Members (Multiple)
│   │   ├── Member Name
│   │   ├── Role/Designation
│   │   └── % Allocation
│   └── Stakeholders
├── Timeline
│   ├── Start Date
│   ├── End Date (Expected)
│   ├── Actual End Date (if completed)
│   └── Days Remaining
├── Budget
│   ├── Total Budget Allocated (₹)
│   ├── Budget by Category (Salaries, Materials, etc.)
│   ├── Actual Spending (₹)
│   └── Budget Remaining
├── Milestones
│   ├── Milestone Name
│   ├── Target Date
│   ├── Deliverables
│   ├── % Complete
│   └── Status (Pending/In Progress/Completed)
├── Progress
│   ├── Total Tasks
│   ├── Completed Tasks
│   ├── In-Progress Tasks
│   ├── Blocked/On-Hold Tasks
│   └── Overall % Complete
└── Tracking
    ├── Created Date
    ├── Created By
    ├── Last Status Update
    └── Audit Trail
```

---

## Module 2: Task Management

### Purpose
Break down projects into actionable tasks with assignments and tracking.

### Key Features

#### 2.1 Task Creation under Projects
- **What:** Create tasks within projects
- **Task Details:**
  - Task Title
  - Description/instructions
  - Project assignment (linked)
  - Assigned to (team member)
  - Due date
  - Priority level

#### 2.2 Task Priority Levels
- **Low:** Nice to have, can be delayed
- **Medium:** Should be done soon
- **High:** Important, needs focus
- **Urgent:** Critical, must do ASAP
- **Visual:** Color-coded by priority

#### 2.3 Task Status Workflow
- **To Do:** Not started
- **In Progress:** Currently being worked
- **Review:** Waiting for review/approval
- **Done:** Completed and accepted
- **Blocked:** Waiting for something/someone else
- **Status Changes:** Tracked with timestamp

#### 2.4 Task Assignment
- **What:** Assign task to team member
- **Assignee:** One person responsible
- **Notification:** Email notification to assignee
- **My Tasks:** Assignee sees in "My Tasks" list
- **Reassignment:** Can reassign if needed

#### 2.5 Due Date Management
- **What:** When task must be completed
- **Notification:**
  - Due tomorrow: Reminder
  - Overdue: Alert
  - Critical: Escalation
- **Late Task:** System tracks overdue
- **Extension:** Can extend due date if needed

#### 2.6 Task Dependencies
- **What:** Task B depends on Task A
- **Blocking:** Cannot start Task B until Task A done
- **Chain:** Multiple dependencies create critical path
- **Slack Time:** Flexibility in scheduling

### Data Model: Task Record

```
Task Record:
├── Header
│   ├── Task ID (Auto-generated)
│   ├── Task Title/Name
│   ├── Task Description
│   ├── Project (Link)
│   └── Task Status (To Do/In Progress/Review/Done/Blocked)
├── Assignment
│   ├── Assigned To (Team member)
│   ├── Assigned By (Manager)
│   ├── Assigned Date
│   └── Reassignment History
├── Priority & Timeline
│   ├── Priority (Low/Medium/High/Urgent)
│   ├── Start Date
│   ├── Due Date
│   ├── Actual Completion Date
│   └── Days Overdue (if late)
├── Dependencies
│   ├── Parent Task (if subtask)
│   ├── Dependent Tasks (blocked by this)
│   ├── Critical Path (Yes/No)
│   └── Slack Time (Days available to delay)
├── Effort & Time
│   ├── Estimated Hours
│   ├── Actual Hours Logged
│   ├── Remaining Hours
│   └── Time Logged By
├── Tracking
│   ├── % Complete
│   ├── Comments/Notes
│   ├── Attachments
│   ├── Checklist Items (if any)
│   └── Created Date
└── Audit Trail
    ├── Created By
    ├── Modified By
    └── Status Change Timeline
```

---

## Module 3: Time Tracking

### Purpose
Log time spent on tasks and projects for billing and productivity tracking.

### Key Features

#### 3.1 Time Log Creation
- **What:** Record time spent on task
- **Fields:**
  - Task (linked)
  - Date of work
  - Start time
  - End time
  - Duration (auto-calculated)
  - Activity description
  - Notes/remarks
- **Manual Entry:** Can type time manually
- **Timer:** Can use stopwatch timer and log time

#### 3.2 Task-wise Time Tracking
- **What:** Total time spent on each task
- **Shows:**
  - Task name
  - Total hours logged
  - By whom and when
  - Breakdown by date
- **Compare:** Estimated vs actual hours

#### 3.3 Activity Logging
- **What:** Describe what was done
- **Examples:**
  - "Designed database schema"
  - "Tested login functionality"
  - "Client meeting - requirements gathering"
- **Benefit:** Know what hours were spent on
- **Detail:** Supports project documentation

#### 3.4 Project-wise Time Summary
- **What:** Total hours per project
- **Shows:**
  - Project name
  - Total hours logged by all team
  - Hours by person
  - Comparison: Estimated vs actual
- **Variance:** If over/under estimated

#### 3.5 Employee Time Utilization Report
- **What:** % of time allocated to projects
- **Shows:**
  - Employee name
  - Hours allocated to projects
  - Hours not allocated (admin, leave)
  - Utilization % (project hours / total hours)
- **Target:** Typically 70-80% project time
- **Report:** Identifies idle time

#### 3.6 Overtime Tracking
- **What:** Time exceeding normal hours
- **Normal:** 8 hours per day, 40 hours per week
- **Overtime:** Hours beyond normal
- **Tracking:** Separate line for OT
- **Billing:** Higher rate for overtime
- **Regulatory:** Comply with labor laws

#### 3.7 Time Approval Workflow
- **Flow:**
  1. Employee logs time
  2. Employee submits for approval
  3. Project manager reviews
  4. Manager approves (or queries)
  5. Time locked, can't be changed
- **Notification:** Email at each stage
- **Comments:** Manager can add notes

### Data Model: Time Tracking Records

```
Time Log Entry:
├── Header
│   ├── Time Log ID (Auto-generated)
│   ├── Employee Name
│   ├── Date of Work
│   ├── Date Logged (entry date)
│   └── Status (Draft/Submitted/Approved/Rejected)
├── Time Details
│   ├── Start Time (HH:MM)
│   ├── End Time (HH:MM)
│   ├── Duration (Hours) [Auto-calculated]
│   ├── Break Time (if any)
│   ├── Billable Hours
│   └── Non-Billable Hours
├── Activity & Task
│   ├── Project (Link)
│   ├── Task (Link)
│   ├── Activity Description
│   ├── Work Done (Detailed description)
│   └── Notes/Comments
├── Classification
│   ├── Work Type (Project/Admin/Training/Leave)
│   ├── Billing Type (Billable/Non-Billable)
│   ├── Is Overtime (Yes/No)
│   └── Time Category (Regular/OT/Holiday)
├── Rate & Cost
│   ├── Hourly Rate (₹)
│   ├── Cost to Project (₹)
│   └── Cost to Company (₹)
├── Approval
│   ├── Submitted By (Employee)
│   ├── Approved By (Manager)
│   ├── Approval Date
│   ├── Approval Comments
│   └── Rejection Reason (if applicable)
└── Audit Trail
    ├── Created Date & Time
    ├── Modified Date & Time
    ├── Modified By
    └── Timestamp History

Project Time Summary:
├── Project Information
│   ├── Project Name
│   ├── Project Period (Start - End)
│   └── Project Status
├── Time Breakdown
│   ├── Total Hours Logged (all team)
│   ├── Billable Hours
│   ├── Non-Billable Hours
│   ├── Estimated Hours (original estimate)
│   └── Variance (Actual - Estimate)
├── By Team Member
│   ├── Member Name
│   ├── Hours Logged
│   ├── Hourly Rate
│   ├── Cost to Project
│   └── % of Project Time
├── By Task
│   ├── Task Name
│   ├── Hours Logged
│   ├── % of Project
│   └── Status (On Track/Over/Under)
└── Cost Analysis
    ├── Total Project Cost (₹)
    ├── Budget (₹)
    ├── Budget Variance (Actual - Budget)
    └── Cost per Hour (₹)

Employee Utilization Report:
├── Employee Information
│   ├── Employee Name
│   ├── Employee ID
│   ├── Department
│   └── Reporting Manager
├── Time Allocation
│   ├── Total Working Hours (period)
│   ├── Project Hours
│   ├── Admin/Internal Hours
│   ├── Training Hours
│   ├── Leave Hours
│   └── Unaccounted Hours
├── Utilization Analysis
│   ├── Project Utilization % = (Project Hours / Total Hours) × 100
│   ├── Billable Utilization %
│   ├── Target Utilization %
│   ├── Variance
│   └── Trend (vs previous period)
├── Projects Worked On
│   ├── Project Name
│   ├── Hours on Project
│   └── % of Time
└── Recommendations
    ├── If Under Utilized: Allocate to more projects
    ├── If Over Utilized: Hire or reduce load
    └── Comments
```

---

## Module 4: Resource Planning

### Purpose
Allocate team resources across projects and track utilization.

### Key Features

#### 4.1 Team Member Capacity Management
- **What:** How much work each person can take
- **Capacity:** Hours available per week
  - Full-time: 40 hours/week
  - Part-time: 20 hours/week
  - Flexible: 30 hours/week
- **Allocation:** Can allocate up to capacity
- **Overallocation Warning:** If exceed capacity
- **Leave:** Reduces available capacity

#### 4.2 Resource Allocation by Project & Task
- **What:** Assign people to projects/tasks
- **Example:**
  - Project: E-commerce Website
  - Assign: John (40 hrs), Sarah (30 hrs), Mike (20 hrs)
  - Tasks: Design, Development, Testing
- **Timeline:** Can be temporary (specific dates)

#### 4.3 Resource Utilization Report
- **What:** How busy is each person
- **Shows:**
  - Employee name
  - Available hours/week
  - Allocated hours/week
  - Utilization % (Allocated / Available)
  - Projects assigned
  - Time logged vs allocated
- **Over-allocated:** Red flag if > 100%
- **Under-allocated:** Opportunity to assign more

#### 4.4 Skill-based Resource Assignment
- **What:** Assign based on skills
- **Skills:** Defined per employee
  - Example: Java, Python, Database, Frontend
- **Project Needs:** Required skills
- **Matching:** System suggests skilled resources
- **Gap:** Shows if skill not available

#### 4.5 Resource Conflict Detection
- **What:** When person assigned to overlapping work
- **Scenario:** John assigned to Project A (Mon-Wed) and Project B (Tue-Thu)
  - Overlap on Tue-Wed
  - System alerts
  - Manager must resolve
- **Benefit:** Prevents over-commitment

#### 4.6 Employee Workload Dashboard
- **What:** Visual of what each person is working on
- **Shows:**
  - Current projects & tasks
  - Upcoming deadlines
  - Total allocated hours
  - Time logged vs allocated
  - Overdue tasks
- **Filters:** By project, by team, by status

#### 4.7 Resource Leveling & Optimization
- **What:** Distribute work evenly
- **Problem:** Some people too busy, others idle
- **Solution:** Reassign work to level load
- **Process:**
  1. Identify overallocated person
  2. Find underallocated person with skills
  3. Move task/project to underallocated
  4. Update allocation
  5. Notify affected people

---

# HR & Payroll (HRMS)

## Overview
Complete human resource management from employee onboarding to payroll processing.

## Module 1: Employee Management

### Purpose
Employee master records and personnel management.

### Key Features

#### 1.1 Employee Creation & Profile
- **What:** Create employee record
- **Personal Information:**
  - Full name
  - Date of birth
  - Gender
  - Martial status
  - Contact number
  - Email address
  - Permanent address
- **Employment Information:**
  - Employee ID (unique)
  - Joining date
  - Designation
  - Department
  - Employment type (Permanent, Contract, Temporary)
  - Reporting manager
  - Grade/Level

#### 1.2 Employee Contact & Emergency Info
- **Official Contact:**
  - Office phone
  - Office email
  - Office address
- **Emergency Contacts:**
  - Person 1: Name, relation, phone
  - Person 2: Name, relation, phone
- **Medical Information:**
  - Blood type
  - Allergies
  - Medical conditions
  - Insurance details

#### 1.3 Employment Type & Designation
- **Employment Types:**
  - **Permanent:** Full-time, indefinite tenure
  - **Contract:** Fixed duration, contract-based
  - **Temporary:** Short-term, need-based
  - **Intern:** Student, training position
  - **Consultant:** External, project-based
- **Designation:** Job title/position (Developer, Manager, etc.)
- **Grade:** Salary grade/level (L1, L2, L3, etc.)

#### 1.4 Department & Reporting Structure
- **Department:** Which department (Sales, IT, Finance, HR, etc.)
- **Reporting Manager:** Direct manager
- **Team Members:** Subordinates reporting to this person
- **Matrix:** Can have multiple reporting lines
- **Hierarchy:** Creates organizational structure

#### 1.5 Joining & Separation Tracking
- **Joining Date:** When employee started
- **Probation Period:** If applicable (usually 3-6 months)
- **Separation Date:** When employee leaves
- **Resignation Date:** When they gave resignation
- **Notice Period:** Remaining days to work
- **Separation Reason:** Voluntary/Involuntary/Retirement
- **Exit Interview:** Document reasons

#### 1.6 Employee Documents
- **What:** Store documents digitally
- **Documents:**
  - Resume/CV
  - Offer letter
  - Employment contract
  - Certificates & qualifications
  - ID proof (Aadhar, PAN)
  - Address proof
  - Bank details
  - Health records
- **Expiry Tracking:** Alert when documents expire
- **Access Control:** Restricted to HR & employee

#### 1.7 Employment History & Promotions
- **What:** Track career growth
- **History Includes:**
  - Positions held
  - Dates in each position
  - Department changes
  - Promotions
  - Salary history
  - Performance ratings
- **Promotion Record:** When promoted, old record archived
- **Career Path:** Track progression

### Data Model: Employee Record

```
Employee Master:
├── Identification
│   ├── Employee ID (Unique)
│   ├── Full Name
│   ├── Date of Birth
│   ├── Gender
│   └── Marital Status
├── Contact Information
│   ├── Personal Phone
│   ├── Personal Email
│   ├── Permanent Address (Full)
│   ├── Office Phone
│   ├── Office Email
│   └── Office Address
├── Emergency Contacts
│   ├── Contact 1 (Name, Relation, Phone)
│   ├── Contact 2 (Name, Relation, Phone)
│   └── Medical Information
├── Employment Details
│   ├── Joining Date
│   ├── Joining Designation
│   ├── Current Designation
│   ├── Current Department
│   ├── Employment Type (Permanent/Contract/Temporary)
│   ├── Grade/Level
│   ├── Reporting Manager
│   ├── Probation End Date (if applicable)
│   └── Status (Active/On Leave/Separated)
├── Separation (if applicable)
│   ├── Separation Date
│   ├── Resignation Date
│   ├── Notice Period
│   ├── Separation Reason
│   ├── Full-Final Status
│   └── Settlement Amount
├── Documents
│   ├── Resume/CV
│   ├── Offer Letter
│   ├── Employment Contract
│   ├── Certificates
│   ├── Identity Proof
│   ├── Address Proof
│   ├── Bank Details
│   └── Expiry Tracking
├── Salary & Benefits
│   ├── Salary Grade
│   ├── Base Salary (₹)
│   ├── CTC (Cost to Company)
│   ├── Bank Account (Salary)
│   └── ESIC/PF Details
└── Tracking
    ├── Created Date
    ├── Joining Timeline
    ├── Promotion History
    └── Last Modified
```

---

## Module 2: Leave Management

### Purpose
Request and track employee leaves with approval workflow.

### Key Features

#### 2.1 Leave Type Creation
- **What:** Define types of leave offered
- **Common Types:**
  - **Casual Leave (CL):** General leave, 12 days/year
  - **Sick Leave (SL):** Medical reasons, 6 days/year
  - **Earned Leave (EL):** Annual vacation, 20 days/year
  - **Maternity Leave:** Pregnancy, 6 months
  - **Paternity Leave:** Newborn care, 15 days
  - **Bereavement Leave:** Family death, 3-5 days
  - **Unpaid Leave:** No salary, limited
- **Allocation:** Days per employee per year
- **Carry Forward:** Can unused days carry to next year?

#### 2.2 Leave Allocation
- **What:** Allocate leave days to employee
- **Process:**
  1. Define leave types & allocation
  2. Allocate per employee per fiscal year
  3. Send notification to employee
  4. Employee can see available leave
  5. System tracks usage
- **Allocation Record:**
  - Employee name
  - Leave type
  - No. of days allocated
  - From date (start of period)
  - To date (end of period)
  - Carry forward from previous
  - Total available

#### 2.3 Leave Application Process
- **What:** Employee applies for leave
- **Steps:**
  1. Click "Apply Leave"
  2. Select leave type
  3. Select from & to date
  4. Add reason (optional)
  5. Attach medical cert (if sick leave)
  6. Submit for approval
- **Auto-calculation:** System shows leave balance
- **Confirmation:** Gets reference number

#### 2.4 Approval Workflow
- **Approver:** Manager/Team Lead
- **Review:**
  - Check dates
  - Check leave balance
  - Check project/work impact
  - Can ask for more details
- **Actions:**
  - **Approve:** Leave granted
  - **Reject:** Leave denied with reason
  - **Query:** Ask employee for details
- **Status Updates:** Email notifications
- **Auto-Approval:** If manager not responding after N days, auto-approve

#### 2.5 Leave Balance Tracking
- **What:** How much leave employee has
- **Calculated:**
  - Opening balance (previous unused)
  - Plus: Allocation (this year)
  - Less: Used (days taken)
  - = Balance (days remaining)
- **Real-time:** Updated when leave taken
- **Statement:** Monthly leave statement
- **Alert:** When running low on leave

#### 2.6 Holiday Calendar Management
- **What:** Define company holidays
- **Holidays Include:**
  - National holidays (Independence Day, etc.)
  - Regional holidays (state-specific)
  - Religious holidays (Diwali, Eid, etc.)
  - Company holidays (Foundation day, etc.)
- **Non-working Days:**
  - Saturdays, Sundays (typically)
  - Defined per organization
- **Leave Impact:** Holidays not deducted from leave balance
- **Payroll Impact:** Paid as full day salary

#### 2.7 Leave Encashment & Settlement
- **What:** Cash out unused leave
- **Policy:** Typically allowed at year-end or separation
- **Calculation:**
  - Unused leave days × Daily rate
  - Example: 5 days × ₹500/day = ₹2,500
- **Daily Rate:** Salary / 30 days
- **Tax:** Subject to tax laws
- **Settlement:** On separation, mandatory

### Data Model: Leave Records

```
Leave Type:
├── Leave Type Name (Casual, Sick, Earned, etc.)
├── Default Allocation
│   ├── Days per Year
│   ├── Carry Forward allowed (%)
│   └── Maximum Carry Forward Days
├── Processing
│   ├── Require Medical Certificate (Yes/No)
│   ├── Require Manager Approval (Yes/No)
│   ├── Require HR Approval (Yes/No)
│   └── Auto-Approval Days
└── Financial Impact
    ├── Paid (Yes/No)
    ├── Encashment Allowed (Yes/No)
    └── Tax Treatment

Leave Allocation:
├── Employee (Link)
├── Leave Type
├── Period (From Date - To Date)
├── Days Allocated
├── Carry Forward from Previous (Days)
├── Total Available (Allocated + Carry Forward)
├── Days Used (This Period)
├── Days Remaining
├── Allocation Date
└── Expiry Date

Leave Application:
├── Header
│   ├── Application ID (Auto-generated)
│   ├── Employee Name
│   ├── Leave Type
│   ├── From Date
│   ├── To Date
│   ├── No. of Days (Auto-calculated)
│   └── Application Status (Draft/Submitted/Approved/Rejected)
├── Details
│   ├── Reason for Leave
│   ├── Contact During Leave (if any)
│   ├── Medical Certificate (Attached)
│   └── Handover Notes
├── Approval
│   ├── Approver (Manager)
│   ├── Approval Date
│   ├── Approval Status (Pending/Approved/Rejected)
│   ├── Approval Comments
│   └── Rejection Reason (if applicable)
├── Impact
│   ├── Leave Balance Before
│   ├── Days Applied
│   ├── Leave Balance After (if approved)
│   └── Contingency Arrangements (if applicable)
└── Audit Trail
    ├── Created Date
    ├── Submitted Date
    ├── Approved Date
    └── Timestamp

Leave Statement (Monthly):
├── Employee Information
│   ├── Employee Name
│   ├── Employee ID
│   ├── Department
│   └── Month & Year
├── Leave Balance
│   ├── Opening Balance
│   ├── Allocation (This Month)
│   ├── Days Used (This Month)
│   ├── Closing Balance
│   └── By Leave Type Breakdown
└── Year-to-Date
    ├── YTD Allocation
    ├── YTD Used
    ├── YTD Balance
    └── Comparison (Same period last year)
```

---

## Module 3: Attendance Tracking

### Purpose
Daily attendance marking and shift management.

### Key Features

#### 3.1 Daily Attendance Marking
- **What:** Mark present/absent/leave each day
- **Status Options:**
  - **Present (P):** Marked present on time
  - **Absent (A):** Did not come
  - **Half Day (HD):** Only half day present
  - **Work From Home (WFH):** Working remotely
  - **Leave (L):** On approved leave
  - **Holiday (H):** Company/national holiday
  - **Weekend (W):** Saturday/Sunday
- **Method:** Manual, biometric, or system integration
- **Approval:** Manager can mark if employee absent

#### 3.2 Shift Assignment & Rotation
- **What:** Define work schedule
- **Shift Types:**
  - **General:** 9 AM - 5 PM
  - **Early:** 7 AM - 3 PM
  - **Late:** 1 PM - 9 PM
  - **Night:** 9 PM - 5 AM
  - **Flexible:** Employee decides (core hours required)
- **Rotation:** Change shifts regularly (e.g., weekly)
- **Assignment:** Per employee per date

#### 3.3 Late Coming & Early Going Tracking
- **Late Coming:**
  - Expected: 9:00 AM
  - Actual: 9:30 AM
  - Late By: 30 minutes
  - Deduction: As per policy (usually ₹ or hours)
- **Early Going:**
  - Expected: 5:00 PM
  - Actual: 4:30 PM
  - Early By: 30 minutes
  - May be adjusted if balanced with overtime
- **Threshold:** 5 min grace period usually

#### 3.4 Attendance Rule Enforcement
- **What:** Automatic policy application
- **Rules:**
  - 3 lates in a month → Warning
  - 5 consecutive absents without leave → Show cause
  - Less than 75% attendance → Salary deduction/Termination
  - More than X days absent in quarter → Review
- **Alert:** Automatic warnings generated
- **Exception:** Can be manually adjusted by HR

#### 3.5 Bulk Attendance Import
- **What:** Upload attendance from file
- **Format:** Excel/CSV with emp ID, date, status
- **Process:**
  1. Prepare file
  2. Upload to system
  3. System validates
  4. Shows discrepancies
  5. Approve to save
- **Frequency:** Daily or batch import

#### 3.6 Attendance Report & Analytics
- **What:** Analysis of attendance
- **Reports:**
  - **Attendance Register:** All employees, month-wise
  - **Absent Report:** Who was absent when
  - **Late Report:** Late comers list
  - **Attendance %:** % present per employee
  - **Trends:** Attendance over time
- **By Department:** Can filter by dept
- **By Shift:** Can filter by shift type

#### 3.7 Biometric Integration Support
- **What:** Connect to biometric devices
- **Integration:** Reads punch card automatically
- **Benefits:**
  - Eliminates manual marking errors
  - Real-time data
  - Cannot be manipulated
  - Audit trail maintained
- **Data Sync:** Daily sync from device to system

### Data Model: Attendance Records

```
Daily Attendance:
├── Header
│   ├── Date
│   ├── Employee (Link)
│   ├── Shift Assigned
│   └── Attendance Status (P/A/HD/WFH/L/H/W)
├── Time Details
│   ├── Check-in Time
│   ├── Check-out Time
│   ├── Total Hours Present
│   ├── Expected Hours
│   ├── Late By (Minutes)
│   ├── Early By (Minutes)
│   └── Overtime (Hours)
├── Deductions/Adjustments
│   ├── Late Deduction (₹)
│   ├── Early Going Deduction (₹)
│   ├── Other Deduction
│   └── Reason
├── Leave Link
│   ├── Leave Application (Link)
│   ├── Leave Type
│   └── Approval Status
└── Audit Trail
    ├── Created/Marked By
    ├── Marked Date & Time
    ├── Modified By
    └── Modification Reason

Shift Master:
├── Shift Details
│   ├── Shift Name (General/Early/Late/Night)
│   ├── Start Time
│   ├── End Time
│   ├── Break Time (Duration & Timing)
│   ├── Total Working Hours
│   └── Description
├── Flexibility
│   ├── Flexible Shift (Yes/No)
│   ├── Core Hours Start (if flexible)
│   ├── Core Hours End (if flexible)
│   └── Slack Minutes (Grace period)
└── Assignment
    ├── Employees Assigned
    ├── Rotation Schedule
    └── Effective Date

Shift Assignment:
├── Employee (Link)
├── Shift Type (Link)
├── From Date
├── To Date
├── Reason (if changed)
├── Previous Shift (if rotation)
├── Next Shift (if known)
└── Change Notification (Sent to Employee)

Attendance Report:
├── Header
│   ├── Report Period (Month/Quarter/Year)
│   ├── Department (if filtered)
│   ├── Shift (if filtered)
│   └── Report Generated Date
├── Employee-wise Summary
│   ├── Employee Name/ID
│   ├── Total Working Days (excluding Holidays/Weekends)
│   ├── Days Present
│   ├── Days Absent
│   ├── Days Leave
│   ├── Days Half Day
│   ├── Days WFH
│   ├── Attendance %
│   ├── Late Count
│   ├── Early Going Count
│   └── Overtime Hours
├── Statistical Analysis
│   ├── Dept Average Attendance %
│   ├── Highest Attendance
│   ├── Lowest Attendance
│   ├── Most Absent Employees
│   └── Most Late Employees
└── Alerts/Exceptions
    ├── Below Threshold (< 75%)
    ├── Warning Generated
    └── Action Recommended
```

---

## Module 4: Payroll Processing

### Purpose
Monthly salary calculation and payment processing.

### Key Features

#### 4.1 Salary Structure Creation
- **What:** Define salary components and deductions
- **Components (Earnings):**
  - **Basic Salary:** Base fixed pay
  - **HRA (House Rent Allowance):** Typically 40-50% of basic
  - **DA (Dearness Allowance):** Inflation adjustment, 10-20% of basic
  - **Conveyance:** Travel allowance, fixed amount
  - **Medical:** Health allowance, fixed or % based
  - **Special Allowance:** Other allowances, variable
- **Deductions:**
  - **PF (Provident Fund):** Employee contribution, 12% of basic
  - **ESI (Employee State Insurance):** 0.75% (employer pays rest)
  - **Professional Tax:** State-based, varies
  - **Income Tax:** On gross income
  - **Loan EMI:** If employee has loan
  - **Other:** Any other deductions
- **Gross Salary:** Sum of all earnings
- **Net Salary:** Gross - Deductions

#### 4.2 Salary Slip Generation
- **What:** Monthly payslip for employee
- **Contents:**
  - Employee name, ID, designation
  - Salary period (Month-Year)
  - Earnings (itemized breakdown)
  - Deductions (itemized breakdown)
  - Gross salary
  - Net salary
  - YTD (Year-to-date) totals
  - Employer contributions
- **Generation:** Auto at month-end
- **Distribution:** Email to employee

#### 4.3 Basic, HRA, DA Calculation
- **Formula:**
  ```
  Basic = Fixed amount (e.g., ₹20,000)
  HRA = 50% of Basic (e.g., ₹10,000)
  DA = 15% of Basic (e.g., ₹3,000)
  Special Allow = Fixed amount (e.g., ₹5,000)
  ```
- **Total Earnings = Basic + HRA + DA + Special Allow + Medical + Others**
- **Adjustment:** Changed monthly if salary revision

#### 4.4 Allowances Management
- **Types:**
  - Fixed: Same every month
  - Variable: Changes based on conditions (overtime, bonus)
  - Conditional: Only when certain condition met
- **Examples:**
  - Conveyance: ₹1,500 fixed
  - Performance bonus: Varies monthly
  - Project incentive: When project completes
- **Configuration:** Per structure per employee

#### 4.5 Deduction Management
- **Tax Deduction:**
  - Income tax calculated on gross
  - Slab-based (Progressive tax)
  - Depends on income level
- **Statutory:**
  - PF (Provident Fund): 12% salary
  - ESI: If monthly salary < ₹21,000
  - Professional Tax: ₹0-300 based on state
- **Voluntary:** Loan repayment, investments

#### 4.6 Income Tax (IT) Calculation
- **What:** Tax on employee income
- **Slabs (FY 2025-26):**
  ```
  ₹0 - ₹2,50,000: Nil
  ₹2,50,001 - ₹5,00,000: 5%
  ₹5,00,001 - ₹10,00,000: 20%
  > ₹10,00,000: 30%
  ```
- **Rebate:** Section 87A provides rebate for < ₹5 lakh
- **Deduction:** From salary each month
- **Reconciliation:** Year-end settlement

#### 4.7 Bonus & Incentive Calculation
- **Bonus:**
  - Diwali bonus: Typically 1 month salary
  - Annual bonus: Variable % of annual salary
  - Festival bonus: Holi, others
- **Incentive:**
  - Sales incentive: % of sales
  - Performance bonus: Based on rating
  - Project bonus: On project completion
- **Addition:** Added to salary for relevant month

#### 4.8 Bank Transfer & Payment Reconciliation
- **Process:**
  1. Salary finalized
  2. Generate payment file
  3. Upload to bank (NEFT/RTGS)
  4. Bank transfers to employee accounts
  5. Confirmation received
  6. System matches confirmation with payroll
- **Modes:**
  - NEFT: Electronic transfer
  - RTGS: Real-time transfer
  - Cheque: If employee requests
  - Cash: Small companies only
- **Timing:** Typically first week of month

### Data Model: Payroll Records

```
Salary Structure:
├── Structure Name (Standard/Grade-wise)
├── Applicable To (Employee Grade/Dept)
├── Effective From (Date)
├── Effective Till (Date)
├── Earnings Components
│   ├── Basic Salary (₹)
│   ├── HRA (% of Basic or Fixed)
│   ├── DA (% of Basic or Fixed)
│   ├── Conveyance (Fixed ₹)
│   ├── Medical (Fixed ₹)
│   ├── Special Allowance (₹)
│   └── Other Components (Flexible)
├── Deduction Components
│   ├── PF Contribution (12% of Basic)
│   ├── ESI Contribution (if eligible)
│   ├── Professional Tax (State-based)
│   ├── Income Tax (Calculated)
│   ├── Loan Repayment (if applicable)
│   └── Other Deductions (Variable)
├── Calculations
│   ├── Total Earnings (Sum of components)
│   ├── Total Deductions (Sum of deductions)
│   └── Net Salary (Earnings - Deductions)
└── Employer Contributions
    ├── PF Employer Contribution (12%)
    ├── ESI Employer Contribution (if eligible)
    └── Total Employer Cost

Salary Slip:
├── Header
│   ├── Salary Slip ID (Auto-generated)
│   ├── Employee Name
│   ├── Employee ID
│   ├── Designation
│   ├── Department
│   ├── Salary Period (Month-Year)
│   └── Days Worked
├── Earnings
│   ├── Basic Salary (₹)
│   ├── HRA (₹)
│   ├── DA (₹)
│   ├── Conveyance (₹)
│   ├── Medical (₹)
│   ├── Bonus/Incentive (if applicable)
│   ├── Other Earnings
│   └── Total Earnings (₹)
├── Deductions
│   ├── PF Deduction (₹)
│   ├── ESI Deduction (₹)
│   ├── Professional Tax (₹)
│   ├── Income Tax (₹)
│   ├── Loan EMI (₹)
│   ├── Other Deductions (₹)
│   └── Total Deductions (₹)
├── Net Salary
│   ├── Gross Salary (Total Earnings)
│   ├── Less: Total Deductions
│   └── Net Salary Payable (₹)
├── Employer Contributions
│   ├── PF Employer Share (₹)
│   ├── ESI Employer Share (₹)
│   └── Total Employer Cost (₹)
├── Year-to-Date Summary
│   ├── YTD Earnings
│   ├── YTD Deductions
│   ├── YTD Net
│   └── YTD Tax
└── Bank Details
    ├── Bank Name
    ├── Account No. (Masked)
    ├── IFSC Code
    └── Payment Status

Payroll Summary (Monthly):
├── Header
│   ├── Month & Year
│   ├── Total Employees
│   ├── Salaries Processed
│   └── Processing Date
├── Financial Summary
│   ├── Total Gross Salary (₹)
│   ├── Total Deductions (₹)
│   ├── Total Net Payable (₹)
│   ├── Total Employer Cost (₹)
│   └── Grand Total (Payroll Cost to Company)
├── By Category
│   ├── By Department (Salary wise)
│   ├── By Grade (Salary wise)
│   └── By Status (Permanent/Contract/Temporary)
├── Tax Summary
│   ├── Total Income Tax (₹)
│   ├── Total PF (₹)
│   ├── Total ESI (₹)
│   ├── Total Professional Tax (₹)
│   └── Total Other Deductions (₹)
├── Exceptions
│   ├── Employees on Leave (Count)
│   ├── Employees with Negative Salary (if applicable)
│   ├── Payment Failures (if any)
│   └── Manual Adjustments Made
└── Approvals
    ├── Prepared By (HR)
    ├── Verified By (Finance)
    ├── Approved By (CFO/Director)
    └── Released Date
```

---

## Module 5: Performance Management

### Purpose
Performance appraisal and employee evaluation.

### Key Features

#### 5.1 Appraisal Goal Setting
- **What:** Define performance goals
- **SMART Goals:**
  - Specific: Clear, well-defined
  - Measurable: Can be quantified
  - Achievable: Realistic
  - Relevant: Aligned to role & company
  - Time-bound: With deadline
- **Examples:**
  - "Increase sales by 20% in Q3"
  - "Complete project X by June 30"
  - "Reduce defects by 15%"
- **Review:** Quarterly or annually
- **Tracking:** Progress monitored throughout

#### 5.2 Performance Rating & Scoring
- **Rating Scale:**
  - 1: Below Expectations
  - 2: Meets Minimum
  - 3: Meets Expectations
  - 4: Exceeds Expectations
  - 5: Significantly Exceeds
- **Scoring:** Based on goal completion, behaviors, competencies
- **Final Rating:** Weighted average of components
- **Calibration:** Senior management review to ensure consistency

#### 5.3 360-Degree Feedback
- **What:** Feedback from multiple sources
- **Sources:**
  - Manager (Direct manager)
  - Peers (Same level colleagues)
  - Subordinates (Reports to this person)
  - Self (Employee's own rating)
  - Clients (External customers, if applicable)
- **Anonymity:** Feedback typically anonymous
- **Compilation:** System aggregates feedback
- **Discussion:** Feedback discussed with employee

#### 5.4 Appraisal Workflow
- **Process:**
  1. Manager creates appraisal
  2. Manager rates performance
  3. Employee sees draft, can comment
  4. Senior manager reviews
  5. HR reviews for calibration
  6. Final approval by Director/CEO
  7. Feedback discussion with employee
  8. Closure & archival
- **Timeline:** Usually annual, can be half-yearly

#### 5.5 Employee Performance History
- **What:** Archive of past appraisals
- **Stored:**
  - Appraisal period
  - Rating given
  - Goals achieved
  - Areas for improvement
  - Feedback received
  - Development plans created
- **Trend:** Shows performance over years
- **Promotion Base:** Used for promotion decisions

#### 5.6 Skill Assessment & Mapping
- **What:** Identify employee skills & gaps
- **Skills:** Technical (Java, SQL, etc.) & Soft (Leadership, Communication)
- **Current Skills:** What employee has today
- **Required Skills:** What needed for role
- **Gap:** Difference between current & required
- **Development Plan:** Training to bridge gap

#### 5.7 Performance Report Generation
- **Reports:**
  - Top performers (Rating 5, 4)
  - Performance issues (Rating 1, 2)
  - By department
  - By grade level
  - Performance trends
- **Used For:**
  - Bonus/incentive decisions
  - Promotion recommendations
  - Termination decisions
  - Training needs identification

---

## Module 6: Recruitment

### Purpose
Job opening creation and candidate management.

### Key Features

#### 6.1 Job Opening Creation
- **What:** Post new job vacancy
- **Details:**
  - Job title
  - Department
  - Designation/Grade
  - Reporting to (Manager)
  - No. of positions
  - Job description
  - Key responsibilities
  - Required qualifications
  - Required experience
  - Required skills
  - Salary range
  - Location
  - Employment type
  - Start date
- **Approval:** HR approval before posting
- **Status:** Open/Closed/Filled

#### 6.2 Job Applicant Tracking
- **What:** Track all applicants for job
- **Applicant Information:**
  - Name
  - Email, phone
  - Resume attached
  - Source (Where they applied from)
  - Application date
  - Current position & company
  - Expected salary
  - Notice period
- **Status:** Applied/Screening/Interview/Offer/Joined/Rejected
- **Notes:** Comments from interviewers

#### 6.3 Interview Scheduling
- **What:** Schedule interview with candidate
- **Interview Details:**
  - Interview date & time
  - Interviewer(s) name
  - Location/Video call link
  - Interview type (Phone, Video, F2F)
  - Round (1st, 2nd, 3rd, etc.)
- **Notification:** Email to candidate & interviewer
- **Rescheduling:** If needed, auto-email sent

#### 6.4 Offer Letter Generation
- **What:** Auto-generate offer letter
- **Contents:**
  - Company name, address
  - Candidate name
  - Position offered
  - Salary & CTC
  - Benefits (as per structure)
  - Joining date
  - Reporting to
  - Terms & conditions
  - Signature line
- **Template:** Predefined, can customize
- **Acceptance:** Candidate can sign digitally

#### 6.5 Recruitment Status Tracking
- **What:** Where is candidate in process
- **Status Flow:**
  1. Applied: Submitted resume
  2. Screening: CV reviewed
  3. Interview: Called for interview
  4. Offer: Offer letter sent
  5. Accepted: Candidate accepted
  6. Joined: Started working
  7. Rejected: Not selected or declined
- **Duration:** Track time in each stage
- **Bottleneck:** Identify slow stages

#### 6.6 Candidate Evaluation & Scoring
- **What:** Rate candidate against criteria
- **Criteria:**
  - Technical skills (1-5)
  - Communication (1-5)
  - Problem-solving (1-5)
  - Leadership (1-5)
  - Cultural fit (1-5)
  - Overall score (Average)
- **Scoring:** Done by each interviewer
- **Consensus:** Score compared across interviewers
- **Threshold:** Typically need 3.5+ to pass

#### 6.7 Onboarding Checklist
- **What:** Pre-joining tasks for new employee
- **Pre-Joining:**
  - IT setup: Laptop, email, access
  - Desk setup: Office space ready
  - Documents: Offer letter, contracts
  - Admin: ID card, badge, parking
- **Onboarding Day:**
  - Office tour
  - Team introduction
  - Training plan
  - Handbook distribution
- **Week 1:** Orientation, system access, buddy assignment
- **Month 1:** Full training, role understanding

---

## Module 7: Employee Lifecycle

### Purpose
Onboarding and offboarding management.

### Key Features

#### 7.1 Employee Onboarding Templates
- **What:** Predefined onboarding process
- **Template Contains:**
  - Document collection list
  - Training schedule
  - System access checklist
  - Buddy assignment
  - Manager intro meeting
  - Department introduction
  - First 30-day milestones
  - Follow-up schedule
- **Customize:** Per department or role
- **Workflow:** Auto-triggers tasks

#### 7.2 Document Collection & Verification
- **What:** Collect required documents from new hire
- **Documents:**
  - Aadhar proof
  - PAN card
  - Bank details form
  - Address proof
  - Education certificates
  - Previous employment letters
  - Medical report (if required)
  - Address proof
- **Verification:** HR verifies original documents
- **Archival:** Store digitally in system
- **Status:** Pending/Received/Verified

#### 7.3 Training & Induction Programs
- **What:** Train new employee
- **Training Components:**
  - Company overview
  - Culture & values
  - Policies & procedures
  - Role-specific training
  - Systems training (CRM, etc.)
  - Safety training
  - Compliance training
- **Duration:** Usually 1-4 weeks
- **Trainer:** Can be manager, HR, or external
- **Completion:** Tracked and documented

#### 7.4 Employee Separation Process
- **What:** Manage employee exit
- **When Triggered:**
  - Employee resignation
  - Termination (company initiated)
  - Retirement
  - Contract end
- **Process:**
  1. Resignation received/Termination notice given
  2. Notice period begins
  3. Knowledge transfer planned
  4. Handover of responsibilities
  5. Equipment returned
  6. Final settlement calculated
  7. Exit interview conducted
  8. Separation letter issued

#### 7.5 Final Settlement Calculation
- **What:** Calculate final payment to employee
- **Components:**
  - Salary for worked days (proration if mid-month)
  - Unused leave encashment (CTC × days / 365)
  - Gratuity (if eligible): 15 days salary × years / 12
  - Incentives/bonuses (if applicable)
  - Less: Loan outstanding (if any)
  - Less: Advance due (if any)
  - Net amount payable
- **Approval:** Finance & HR approval needed
- **Payment:** Via bank transfer

#### 7.6 Full-Final & Relieving Letter
- **Full-Final Letter:**
  - Confirmation final settlement paid
  - Confirmation all dues cleared
  - Proof of payment
  - Signed by employee
- **Relieving Letter:**
  - Issued on last working day
  - Confirms employment dates
  - States separation reason (if positive)
  - Wishes for future
  - Required for next job application
  - Can mention performance if positive

#### 7.7 Alumni Database Management
- **What:** Keep track of ex-employees
- **Information:**
  - Name, former role
  - Dates of employment
  - Exit reason
  - Email & contact
  - LinkedIn profile
  - Current company (if known)
- **Purpose:**
  - Re-hiring eligible employees
  - Alumni network & events
  - Reference checks
  - Boomerang hiring (return to company)
- **Benefits:** Tap into proven talent

---

# Technical Architecture

## System Infrastructure

```
┌──────────────────────────────────────────┐
│         Users (Web Browser)              │
└────────────────┬─────────────────────────┘
                 │
┌────────────────▼─────────────────────────┐
│    Nginx Web Server (Frontend)           │
│  - Static files serving                  │
│  - SSL/TLS encryption                    │
│  - Load balancing                        │
└────────────────┬─────────────────────────┘
                 │
┌────────────────▼─────────────────────────┐
│   Frappe Backend (Python/Gunicorn)       │
│  - Business logic processing             │
│  - API endpoints                         │
│  - Report generation                     │
│  - Workflow execution                    │
└────────────────┬─────────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
┌───▼───┐   ┌───▼──┐   ┌────▼────┐
│PostSQL│   │Redis │   │RabbitMQ │
│(Data) │   │(Cache)│   │(Queue)  │
└───────┘   └──────┘   └─────────┘
```

## Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Framework** | Frappe | ERP application framework |
| **Base ERP** | ERPNext | Business modules |
| **HR Module** | HRMS | Human resources system |
| **Language** | Python | Backend development |
| **Database** | PostgreSQL | Data storage |
| **Frontend** | JavaScript/Vue.js | Web UI |
| **Cache** | Redis | Performance caching |
| **Queue** | RabbitMQ | Async job processing |
| **Server** | Nginx/Gunicorn | Web server |
| **Deployment** | Docker | Containerization |

## Database Schema Overview

### Key Tables

```
Employees
├── ID, Name, Email, Phone
├── Designation, Department
├── Join Date, Status
└── Salary Grade, Manager

Transactions (Sales/Purchase)
├── Document No., Type
├── Customer/Supplier
├── Items (Line items)
├── Totals (Subtotal, Tax, Total)
└── Status, Timestamps

Inventory
├── Item Code, Warehouse
├── Qty Available, Qty Reserved
├── Reorder Level, Supplier
└── Valuation, Last Cost

Accounts
├── Account Code, Type
├── Account Balance
├── Transaction History
└── Reconciliation Status
```

---

# Integration & Workflows

## Key Business Workflows

### 1. Lead to Invoice Workflow
```
Lead Created
   ↓
Lead Status: New → Contacted → Qualified
   ↓
Lead Converted to Customer + Deal
   ↓
Deal Moved through Pipeline (5 stages)
   ↓
Deal Won: Create Quotation
   ↓
Customer Accepts: Create Sales Order
   ↓
Goods Packed: Create Delivery Note
   ↓
Goods Delivered: Create Sales Invoice
   ↓
Invoice GST Calculated & Posted
   ↓
Payment Received: Mark Paid
   ↓
Accounting Entries Posted
```

### 2. Purchase to Payment Workflow
```
Low Stock Alert
   ↓
Create Purchase Request
   ↓
Generate RFQ & Send to Suppliers
   ↓
Supplier Quotes Received
   ↓
Select Best Quote: Create PO
   ↓
Goods Received: Create GRN
   ↓
Quality Check: Accept/Reject
   ↓
Supplier Invoice Received
   ↓
3-Way Match (PO-GRN-Invoice)
   ↓
Payment Approved
   ↓
Payment Processed
```

### 3. Payroll Workflow
```
Month-End
   ↓
Attendance Finalized
   ↓
Manual Adjustments Applied
   ↓
Salary Calculated
   ├─ Earnings
   ├─ Deductions
   └─ Net Salary
   ↓
Salary Slip Generated
   ↓
Finance Approval
   ↓
Payment File Created
   ↓
Bank Transfer Done
   ↓
Employee Notification Sent
```

### 4. Leave Management Workflow
```
Employee Applies Leave
   ↓
Leave Balance Checked
   ↓
Manager Reviews
   ├─ Approve
   ├─ Reject
   └─ Query
   ↓
(If Approved)
   ↓
HR Confirms
   ↓
Attendance Updated
   ↓
Payroll Adjusted
   ↓
Employee Notified
```

---

## Integration Points

### 1. **GST Integration**
- Auto-calculation of GST rates
- HSN/SAC code mapping
- GSTR-1, GSTR-2, GSTR-3B readiness
- Tax compliance reporting

### 2. **Banking Integration**
- Salary payment via NEFT/RTGS
- Payment reconciliation
- Bank statement matching
- Cheque printing support

### 3. **Email Integration**
- Transactional emails (confirmations)
- Notifications (approvals, deadlines)
- Reports (monthly summaries)
- Document sending (invoices, payslips)

### 4. **Attendance Integration**
- Biometric device sync
- RFID card readers
- Manual attendance fallback
- Real-time data updates

### 5. **Document Storage**
- Cloud storage integration
- Backup and disaster recovery
- Document versioning
- Audit trail preservation

---

## Reports & Analytics

### Available Reports

#### Sales Reports
- Sales by customer
- Sales trend analysis
- Pipeline analysis
- Forecast vs actual
- Territory performance
- Representative performance

#### Inventory Reports
- Stock valuation
- Inventory aging
- Stock movement
- Supplier performance
- Lead time analysis
- Reorder recommendations

#### Financial Reports
- P&L statement
- Balance sheet
- Cash flow
- GST summary
- Tax compliance
- Budget vs actual

#### HR Reports
- Attendance report
- Payroll summary
- Leave utilization
- Performance analytics
- Attrition analysis
- Training effectiveness

---

## User Roles & Permissions

### Standard Roles

| Role | Access | Permissions |
|------|--------|------------|
| **Administrator** | All modules | Full read/write/delete |
| **Sales Manager** | Sales, Reports | Create leads/deals/orders |
| **Sales Rep** | Sales | Create/view own records |
| **Inventory Manager** | Inventory, Stock | Full inventory control |
| **Accountant** | Accounts, Finance | Invoice, payment, reports |
| **HR Manager** | HR, Payroll | Employee, leave, payroll |
| **Employee** | Limited | View own records (Leave, Salary) |
| **Customer** | Portal only | View invoices, place orders |
| **Supplier** | Portal only | View POs, submit invoices |

---

## Security & Compliance

### Security Features
- Role-based access control (RBAC)
- Encrypted passwords (bcrypt)
- Session management
- API token authentication
- Audit logging of all changes
- Data encryption at rest & transit
- Regular backups

### Compliance
- GST compliance (India)
- Labor law compliance
- Data privacy (GDPR ready)
- Financial audit trail
- Document retention policy
- Password policy enforcement
- Two-factor authentication (optional)

---

## Support & Maintenance

### Regular Updates
- Security patches: Monthly
- Feature updates: Quarterly
- Performance optimization: As needed
- Database maintenance: Weekly

### Documentation
- User manuals per module
- Video tutorials
- Admin guide
- API documentation
- FAQ section
- Community forums

---

## Conclusion

JASSDBX is a comprehensive, integrated business management platform built on proven Frappe Framework and ERPNext technology. It provides complete coverage of enterprise operations from sales to accounting to HR, with automatic workflows, real-time tracking, and financial compliance. The system is scalable, secure, and designed for growing businesses seeking an alternative to expensive enterprise software.

**Key Strengths:**
- Integrated data across all modules
- Automated workflows reduce manual work
- Real-time insights and reporting
- GST compliant for Indian businesses
- Scalable from SMB to enterprise
- Cost-effective vs traditional ERP
- Web-based, no installation required
- Community support and regular updates

---

**Document Version:** 1.0  
**Last Updated:** 2026  
**For Inquiries:** Contact Sales Team  
**Website:** www.jassdbx.com  

---


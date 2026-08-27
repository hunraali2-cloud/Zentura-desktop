// ESC/POS Thermal Receipt Printer Byte Sequence Generator (PKR Currency Edition)

export enum Alignment {
  LEFT = 0,
  CENTER = 1,
  RIGHT = 2
}

export enum TextSize {
  NORMAL = 0x00,
  DOUBLE_HEIGHT = 0x01,
  DOUBLE_WIDTH = 0x10,
  QUAD = 0x11
}

export interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
  total: number;
}

export interface ReceiptOptions {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  invoiceNumber: string;
  cashierName: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  total: number;
  tendered: number;
  change: number;
  paymentMethod: string;
  timestamp: string;
  footerNote?: string;
  paperWidthMm?: 80 | 58;
}

export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.initialize();
  }

  // ESC @: Initialize Printer
  public initialize(): this {
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  // ESC a n: Align Text
  public align(alignment: Alignment): this {
    this.buffer.push(0x1b, 0x61, alignment);
    return this;
  }

  // GS ! n: Text Size / Weight
  public size(size: TextSize): this {
    this.buffer.push(0x1d, 0x21, size);
    return this;
  }

  // Text line printing with line feed (0x0A)
  public text(str: string): this {
    const encoder = new TextEncoder();
    const bytes = Array.from(encoder.encode(str));
    this.buffer.push(...bytes);
    return this;
  }

  public line(str: string = ''): this {
    this.text(str);
    this.buffer.push(0x0a);
    return this;
  }

  public feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  // Two-column or row formatter (Width: 48 chars for 80mm, 32 chars for 58mm)
  public twoColumn(left: string, right: string, width: number = 48): this {
    const spaceCount = width - (left.length + right.length);
    if (spaceCount > 0) {
      this.line(left + ' '.repeat(spaceCount) + right);
    } else {
      this.line(left);
      this.line(' '.repeat(Math.max(0, width - right.length)) + right);
    }
    return this;
  }

  public divider(width: number = 48, char: string = '-'): this {
    this.line(char.repeat(width));
    return this;
  }

  // ESC p 0x00 0x19 0xFA: Kick Cash Drawer Pulse
  public kickDrawer(): this {
    this.buffer.push(0x1b, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  // GS V 0x41 0x00: Full Paper Cut
  public cut(): this {
    this.buffer.push(0x1d, 0x56, 0x41, 0x00);
    return this;
  }

  public build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  // Generate full 80mm/58mm formatted receipt binary byte stream with PKR currency formatting
  public static buildReceipt(options: ReceiptOptions): Uint8Array {
    const width = options.paperWidthMm === 58 ? 32 : 48;
    const builder = new EscPosBuilder();

    // 1. Kick cash drawer
    builder.kickDrawer();

    // 2. Store Header
    builder
      .align(Alignment.CENTER)
      .size(TextSize.DOUBLE_HEIGHT)
      .line(options.storeName)
      .size(TextSize.NORMAL)
      .line(options.storeAddress)
      .line(`Tel: ${options.storePhone}`)
      .feed(1);

    builder.divider(width, '=');

    // 3. Invoice Header
    builder
      .align(Alignment.LEFT)
      .twoColumn(`Bill #: ${options.invoiceNumber}`, options.timestamp, width)
      .twoColumn(`Cashier: ${options.cashierName}`, `Payment: ${options.paymentMethod}`, width);

    builder.divider(width, '-');

    // 4. Line Items Header
    builder.twoColumn('ITEM / QTY x PRICE', 'AMOUNT', width);
    builder.divider(width, '-');

    // 5. Line Items List
    options.items.forEach((item) => {
      builder.twoColumn(
        `${item.name}`,
        `Rs. ${item.total.toLocaleString()}`,
        width
      );
      builder.line(`  ${item.qty} x Rs. ${item.price.toLocaleString()}`);
    });

    builder.divider(width, '-');

    // 6. Totals & Tender Presets
    builder
      .twoColumn('Subtotal Amount:', `Rs. ${options.subtotal.toLocaleString()}`, width)
      .twoColumn('Tax (GST 17%):', `Rs. ${options.tax.toLocaleString()}`, width)
      .size(TextSize.DOUBLE_HEIGHT)
      .twoColumn('TOTAL BILL:', `Rs. ${options.total.toLocaleString()}`, width)
      .size(TextSize.NORMAL)
      .twoColumn('Cash Paid:', `Rs. ${options.tendered.toLocaleString()}`, width)
      .twoColumn('Change Returned:', `Rs. ${options.change.toLocaleString()}`, width);

    builder.divider(width, '=');

    // 7. Footer
    builder
      .align(Alignment.CENTER)
      .feed(1)
      .line(options.footerNote || 'Thank you for shopping with us!')
      .line('Powered by Zentura POS')
      .feed(3)
      .cut();

    return builder.build();
  }
}

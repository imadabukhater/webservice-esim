import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface EsimEmailData {
  customerEmail: string;
  customerName: string;
  orderNumber: string;
  planName: string;
  qrCodeData: string;
  iccid: string;
  activationDate: Date;
  expiryDate: Date;
}

export interface WelcomeEmailData {
  email: string;
  fullName: string;
}

export interface PasswordResetEmailData {
  email: string;
  fullName: string;
  resetToken: string;
}

export interface OrderReceivedEmailData {
  email: string;
  fullName?: string;
  orderNumber: string;
  planName: string;
  amount: number | string;
  currency?: string;
}
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isEnabled = this.configService.get<boolean>('email.enabled', false);

    if (this.isEnabled) {
      this.initializeTransporter();
    } else {
      this.logger.warn(
        'Email service is disabled. Set EMAIL_ENABLED=true to enable.',
      );
    }
  }

  private initializeTransporter(): void {
    const host = this.configService.get<string>('email.host');
    const port = this.configService.get<number>('email.port');
    const user = this.configService.get<string>('email.user');
    const pass = this.configService.get<string>('email.pass');

    if (!host || !user || !pass) {
      this.logger.warn(
        'Email configuration incomplete. Email sending disabled.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 30000,
      pool: true,
      maxConnections: 5,
      logger: false,
      debug: false,
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2',
      },
    });

    this.logger.log(
      `Email service initialized with host: ${host}:${port} (secure: ${port === 465})`,
    );
  }

  async sendEsimQrCode(data: EsimEmailData): Promise<boolean> {
    if (!this.isEnabled || !this.transporter) {
      this.logger.warn(
        `[MOCK EMAIL] QR code would be sent to ${data.customerEmail} for order ${data.orderNumber}`,
      );
      return false;
    }

    const fromEmail = this.configService.get<string>('email.from');
    const fromName = this.configService.get<string>(
      'email.fromName',
      'eSIM Platform',
    );

    const htmlContent = this.generateEsimEmailHtml(data);

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: data.customerEmail,
        subject: `Your eSIM QR Code - Order ${data.orderNumber}`,
        html: htmlContent,
      });

      this.logger.log(
        `Email sent to ${data.customerEmail} for order ${data.orderNumber} (messageId: ${info.messageId})`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${data.customerEmail}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  private generateEsimEmailHtml(data: EsimEmailData): string {
    const formatDate = (date: Date) =>
      date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your eSIM QR Code</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #2563eb; margin: 0;">📱 Your eSIM is Ready!</h1>
    </div>

    <p style="font-size: 16px; color: #333;">
      Hello <strong>${data.customerName}</strong>,
    </p>

    <p style="font-size: 16px; color: #333;">
      Thank you for your purchase! Your eSIM is ready to be activated.
    </p>

    <div style="background-color: #f0f9ff; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="color: #1e40af; margin-top: 0;">Order Details</h2>
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 5px 0; color: #666;">Order Number:</td>
          <td style="padding: 5px 0; font-weight: bold;">${data.orderNumber}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666;">Plan:</td>
          <td style="padding: 5px 0; font-weight: bold;">${data.planName}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666;">ICCID:</td>
          <td style="padding: 5px 0; font-family: monospace;">${data.iccid}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666;">Activation Date:</td>
          <td style="padding: 5px 0;">${formatDate(data.activationDate)}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666;">Expiry Date:</td>
          <td style="padding: 5px 0;">${formatDate(data.expiryDate)}</td>
        </tr>
      </table>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <h2 style="color: #1e40af;">Scan this QR Code to Activate</h2>
      <div style="background-color: white; display: inline-block; padding: 20px; border: 2px solid #e5e7eb; border-radius: 10px;">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&format=png&data=${encodeURIComponent(data.qrCodeData)}" 
             alt="eSIM QR Code" 
             style="width: 150px; height: 150px;">
      </div>
      <p style="font-size: 12px; color: #666; margin-top: 10px;">
        Can't scan? Use this code manually:<br>
        <code style="background-color: #f3f4f6; padding: 5px 10px; border-radius: 4px; font-size: 11px; word-break: break-all;">
          ${data.qrCodeData}
        </code>
      </p>
    </div>

    <div style="background-color: #fef3c7; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <h3 style="color: #92400e; margin-top: 0;">📋 How to Install</h3>
      <ol style="color: #78350f; font-size: 14px; margin: 0; padding-left: 20px;">
        <li>Go to Settings → Cellular/Mobile Data</li>
        <li>Tap "Add eSIM" or "Add Cellular Plan"</li>
        <li>Scan the QR code above</li>
        <li>Follow the on-screen instructions</li>
      </ol>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 12px; color: #666; text-align: center;">
      If you have any questions, please contact our support team.<br>
      Thank you for choosing our service!
    </p>

  </div>
</body>
</html>
    `.trim();
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      this.logger.log('Email server connection verified');
      return true;
    } catch (error) {
      this.logger.error(
        `Email server connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  async sendWelcomeEmail(data: WelcomeEmailData): Promise<boolean> {
    if (!this.isEnabled || !this.transporter) {
      this.logger.warn(
        `[MOCK EMAIL] Welcome email would be sent to ${data.email}`,
      );
      return false;
    }

    const fromEmail = this.configService.get<string>('email.from');
    const fromName = this.configService.get<string>(
      'email.fromName',
      'eSIM Platform',
    );

    const htmlContent = this.generateWelcomeEmailHtml(data);

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: data.email,
        subject: `Welcome to eSIM Platform! 🎉`,
        html: htmlContent,
      });

      this.logger.log(
        `Welcome email sent to ${data.email} (messageId: ${info.messageId})`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send welcome email to ${data.email}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  async sendPasswordResetEmail(data: PasswordResetEmailData): Promise<boolean> {
    if (!this.isEnabled || !this.transporter) {
      this.logger.warn(
        `[MOCK EMAIL] Password reset email would be sent to ${data.email}`,
      );
      return false;
    }

    const fromEmail = this.configService.get<string>('email.from');
    const fromName = this.configService.get<string>(
      'email.fromName',
      'eSIM Platform',
    );

    const frontend = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontend.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(
      data.resetToken,
    )}`;

    const htmlContent = `
      <p>Hello ${data.fullName || 'user'},</p>
      <p>We received a request to reset your password. Click the link below to reset it. This link is valid for 1 hour.</p>
      <p><a href="${resetLink}">Reset your password</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: data.email,
        subject: `Password reset request`,
        html: htmlContent,
      });
      this.logger.log(
        `Password reset email sent to ${data.email} (messageId: ${info.messageId})`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${data.email}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  async sendOrderReceivedEmail(data: OrderReceivedEmailData): Promise<boolean> {
    if (!this.isEnabled || !this.transporter) {
      this.logger.warn(
        `[MOCK EMAIL] Order-received email would be sent to ${data.email} for order ${data.orderNumber}`,
      );
      return false;
    }

    const fromEmail = this.configService.get<string>('email.from');
    const fromName = this.configService.get<string>(
      'email.fromName',
      'eSIM Platform',
    );

    const htmlContent = this.generateOrderReceivedHtml(data);

    try {
      const info = await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: data.email,
        subject: `Order received — ${data.orderNumber}`,
        html: htmlContent,
      });

      this.logger.log(
        `Order-received email sent to ${data.email} for order ${data.orderNumber} (messageId: ${info.messageId})`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send order-received email to ${data.email}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  private generateWelcomeEmailHtml(data: WelcomeEmailData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to eSIM Platform</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #2563eb; margin: 0;">🎉 Welcome to eSIM Platform!</h1>
    </div>

    <p style="font-size: 16px; color: #333;">
      Hello <strong>${data.fullName}</strong>,
    </p>

    <p style="font-size: 16px; color: #333;">
      Thank you for creating an account with us! We're excited to have you on board.
    </p>

    <div style="background-color: #f0f9ff; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="color: #1e40af; margin-top: 0;">Your Account Details</h2>
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 5px 0; color: #666;">Email:</td>
          <td style="padding: 5px 0; font-weight: bold;">${data.email}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666;">Account Status:</td>
          <td style="padding: 5px 0; font-weight: bold; color: #16a34a;">✓ Active</td>
        </tr>
      </table>
    </div>

    <div style="background-color: #ecfdf5; border-radius: 8px; padding: 15px; margin: 20px 0;">
      <h3 style="color: #065f46; margin-top: 0;">🚀 What You Can Do Now</h3>
      <ul style="color: #047857; font-size: 14px; margin: 0; padding-left: 20px;">
        <li>Browse our eSIM plans from various providers</li>
        <li>Purchase an eSIM and receive your QR code instantly</li>
        <li>Manage your orders and view your eSIM history</li>
        <li>Save your favorite plans for quick access</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="http://localhost:9000/api/docs" 
         style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">
        Explore Our Plans
      </a>
    </div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 12px; color: #666; text-align: center;">
      If you have any questions, please contact our support team.<br>
      Thank you for choosing eSIM Platform!
    </p>

  </div>
</body>
</html>
    `.trim();
  }

  private generateOrderReceivedHtml(data: OrderReceivedEmailData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Received</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <div style="background-color: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <div style="text-align: center; margin-bottom: 20px;">
      <h1 style="color: #2563eb; margin: 0;">✅ Order Received</h1>
    </div>

    <p style="font-size: 16px; color: #333;">Hello <strong>${data.fullName || 'Customer'}</strong>,</p>

    <p style="font-size: 16px; color: #333;">Thanks for your order. We've received your order <strong>${data.orderNumber}</strong> for the <strong>${data.planName}</strong> plan.</p>

    <div style="background-color: #f0f9ff; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="color: #1e40af; margin-top: 0;">Order Summary</h2>
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 5px 0; color: #666;">Order Number:</td>
          <td style="padding: 5px 0; font-weight: bold;">${data.orderNumber}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666;">Plan:</td>
          <td style="padding: 5px 0; font-weight: bold;">${data.planName}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; color: #666;">Amount:</td>
          <td style="padding: 5px 0; font-weight: bold;">${data.amount} ${data.currency || ''}</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 16px; color: #333;">Next steps:</p>
    <ol style="font-size: 14px; color: #333;">
      <li>Pay for your order using your chosen payment method.</li>
      <li>After payment, our admin will verify the payment.</li>
      <li>Once verified, we'll send your eSIM (QR code) to this email address.</li>
    </ol>

    <p style="font-size: 12px; color: #666;">If you have any questions, reply to this email or contact our support team.</p>
  </div>
</body>
</html>
    `.trim();
  }
}

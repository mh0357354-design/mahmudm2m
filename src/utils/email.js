const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT) || 2525,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const sendVerificationEmail = async (email, token) => {
    const url = `${process.env.CLIENT_URL}/verify-email?token=${token}`;
    await transporter.sendMail({
        from: `"TechBlog" <${process.env.SMTP_FROM}>`,
        to: email,
        subject: 'Verify your TechBlog account',
        html: `
      <h2>Welcome to TechBlog!</h2>
      <p>Please verify your email by clicking the link below:</p>
      <a href="${url}" style="background:#6366f1;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;">Verify Email</a>
      <p>This link expires in 24 hours.</p>
    `
    });
};

const sendNotificationEmail = async (email, subject, html) => {
    await transporter.sendMail({
        from: `"TechBlog" <${process.env.SMTP_FROM}>`,
        to: email,
        subject,
        html
    });
};

module.exports = { sendVerificationEmail, sendNotificationEmail };

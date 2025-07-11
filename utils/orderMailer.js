const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

function sendOrderEmail({ to, subject, html }) {
  return transporter.sendMail({
    from: `JC's Closet <${process.env.MAIL_USER}>`,
    to,
    subject,
    html,
  });
}

function getDisplayPrice(item) {
  const now = new Date();
  if (
    item.promoEnabled &&
    item.promoValue &&
    item.promoStart &&
    item.promoEnd &&
    new Date(item.promoStart) <= now &&
    new Date(item.promoEnd) >= now
  ) {
    if (item.promoType === 'discount') {
      return Math.round(item.price * (1 - item.promoValue / 100));
    } else if (item.promoType === 'price') {
      return item.promoValue;
    }
  }
  return item.price;
}

function orderCustomerTemplate(order) {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #f8f8fa; padding: 32px; color: #222;">
      <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px #0001; padding: 32px;">
        <h2 style="color: #b48a78; text-align: center;">Thank you for your order, ${order.customer.name}!</h2>
        <p style="text-align: center;">Your payment was received. Here are your order details:</p>
        <p style="text-align: center; color: #388e3c; font-weight: 500; margin-bottom: 12px;">Your order will be delivered within 2-5 working days.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
        <h3 style="color: #b48a78;">Order Summary</h3>
        <ul style="padding: 0; list-style: none;">
          ${order.cart.map(item => {
            const displayPrice = getDisplayPrice(item);
            return `<li style='margin-bottom: 8px;'>${item.name} x${item.quantity} <span style='float:right;'>₦${displayPrice.toLocaleString()}${displayPrice !== item.price ? ` <span style='color:#b48a78;text-decoration:line-through;font-size:13px;'>₦${item.price.toLocaleString()}</span>` : ''}</span></li>`;
          }).join('')}
        </ul>
        <p style="margin: 8px 0 0 0; font-size: 1em;">Delivery Fee: <b>₦${order.deliveryFee?.toLocaleString?.() ?? order.deliveryFee}</b></p>
        <p style="font-weight: bold; font-size: 1.1em;">Grand Total: ₦${order.grandTotal?.toLocaleString?.() ?? order.grandTotal}</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
        <h4 style="color: #b48a78;">Delivery Details</h4>
        <p>${order.customer.address},<br>${order.customer.lga}, ${order.customer.state}<br>Phone: ${order.customer.phone}</p>
        <p style="margin-top: 32px; text-align: center; color: #888;">JC's Closet &copy; 2025</p>
      </div>
    </div>
  `;
}

function orderAdminTemplate(order) {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #f8f8fa; padding: 32px; color: #222;">
      <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px #0001; padding: 32px;">
        <h2 style="color: #b48a78; text-align: center;">New Order Received</h2>
        <p style="text-align: center;">A new order has been placed on JC's Closet.</p>
        <p style="text-align: center; color: #388e3c; font-weight: 500; margin-bottom: 12px;">The order will be delivered within 2-5 working days.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
        <h3 style="color: #b48a78;">Order Summary</h3>
        <ul style="padding: 0; list-style: none;">
          ${order.cart.map(item => {
            const displayPrice = getDisplayPrice(item);
            return `<li style='margin-bottom: 8px;'>${item.name} x${item.quantity} <span style='float:right;'>₦${displayPrice.toLocaleString()}${displayPrice !== item.price ? ` <span style='color:#b48a78;text-decoration:line-through;font-size:13px;'>₦${item.price.toLocaleString()}</span>` : ''}</span></li>`;
          }).join('')}
        </ul>
        <p style="margin: 8px 0 0 0; font-size: 1em;">Delivery Fee: <b>₦${order.deliveryFee?.toLocaleString?.() ?? order.deliveryFee}</b></p>
        <p style="font-weight: bold; font-size: 1.1em;">Grand Total: ₦${order.grandTotal?.toLocaleString?.() ?? order.grandTotal}</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
        <h4 style="color: #b48a78;">Customer Details</h4>
        <p>${order.customer.name}<br>${order.customer.email}<br>${order.customer.phone}<br>${order.customer.address},<br>${order.customer.lga}, ${order.customer.state}</p>
        <p style="margin-top: 32px; text-align: center; color: #888;">JC's Closet Admin Notification</p>
      </div>
    </div>
  `;
}

function orderStatusUpdateTemplate(order, newStatus) {
  let statusMsg = '';
  let extra = '';
  if (newStatus === 'shipped') {
    statusMsg = 'Your order has been shipped!';
    extra = order.shippedAt ? `<p style='color:#888;'>Shipped: ${new Date(order.shippedAt).toLocaleString()}</p>` : '';
  } else if (newStatus === 'delivered') {
    statusMsg = 'Your order has been delivered!';
    extra = order.deliveredAt ? `<p style='color:#888;'>Delivered: ${new Date(order.deliveredAt).toLocaleString()}</p>` : '';
  } else if (newStatus === 'cancelled') {
    statusMsg = 'Your order has been cancelled.';
    extra = order.cancelledAt ? `<p style='color:#b71c1c;'>Cancelled: ${new Date(order.cancelledAt).toLocaleString()}</p>` : '';
  }
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #f8f8fa; padding: 32px; color: #222;">
      <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px #0001; padding: 32px;">
        <h2 style="color: #b48a78; text-align: center;">${statusMsg}</h2>
        <p style="text-align: center;">Order ID: <b>${order._id.toString().slice(-6).toUpperCase()}</b></p>
        <p style="text-align: center; color: #388e3c; font-weight: 500; margin-bottom: 12px;">Your order will be delivered within 2-5 working days from the day the order was placed.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
        <h3 style="color: #b48a78;">Order Summary</h3>
        <ul style="padding: 0; list-style: none;">
          ${order.cart.map(item => {
            const displayPrice = getDisplayPrice(item);
            return `<li style='margin-bottom: 8px;'>${item.name} x${item.quantity} <span style='float:right;'>₦${displayPrice.toLocaleString()}${displayPrice !== item.price ? ` <span style='color:#b48a78;text-decoration:line-through;font-size:13px;'>₦${item.price.toLocaleString()}</span>` : ''}</span></li>`;
          }).join('')}
        </ul>
        <p style="margin: 8px 0 0 0; font-size: 1em;">Delivery Fee: <b>₦${order.deliveryFee?.toLocaleString?.() ?? order.deliveryFee}</b></p>
        <p style="font-weight: bold; font-size: 1.1em;">Grand Total: ₦${order.grandTotal?.toLocaleString?.() ?? order.grandTotal}</p>
        ${extra}
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
        <h4 style="color: #b48a78;">Delivery Details</h4>
        <p>${order.customer.address},<br>${order.customer.lga}, ${order.customer.state}<br>Phone: ${order.customer.phone}</p>
        <p style="margin-top: 32px; text-align: center; color: #888;">JC's Closet &copy; 2025</p>
      </div>
    </div>
  `;
}

function orderAdminCancelTemplate(order) {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; background: #f8f8fa; padding: 32px; color: #222;">
      <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px #0001; padding: 32px;">
        <h2 style="color: #b71c1c; text-align: center;">Order Cancelled by Customer</h2>
        <p style="text-align: center;">A customer has cancelled their order on JC's Closet.</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
        <h3 style="color: #b48a78;">Order Summary</h3>
        <ul style="padding: 0; list-style: none;">
          ${order.cart.map(item => {
            const displayPrice = getDisplayPrice(item);
            return `<li style='margin-bottom: 8px;'>${item.name} x${item.quantity} <span style='float:right;'>₦${displayPrice.toLocaleString()}${displayPrice !== item.price ? ` <span style='color:#b48a78;text-decoration:line-through;font-size:13px;'>₦${item.price.toLocaleString()}</span>` : ''}</span></li>`;
          }).join('')}
        </ul>
        <p style="margin: 8px 0 0 0; font-size: 1em;">Delivery Fee: <b>₦${order.deliveryFee?.toLocaleString?.() ?? order.deliveryFee}</b></p>
        <p style="font-weight: bold; font-size: 1.1em;">Grand Total: ₦${order.grandTotal?.toLocaleString?.() ?? order.grandTotal}</p>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
        <h4 style="color: #b48a78;">Customer Details</h4>
        <p>${order.customer.name}<br>${order.customer.email}<br>${order.customer.phone}<br>${order.customer.address},<br>${order.customer.lga}, ${order.customer.state}</p>
        <p style="color:#b71c1c; font-weight:bold;">Order Cancelled At: ${order.cancelledAt ? new Date(order.cancelledAt).toLocaleString() : ''}</p>
        <p style="margin-top: 32px; text-align: center; color: #888;">JC's Closet Admin Notification</p>
      </div>
    </div>
  `;
}

module.exports = { sendOrderEmail, orderCustomerTemplate, orderAdminTemplate, orderStatusUpdateTemplate, orderAdminCancelTemplate };

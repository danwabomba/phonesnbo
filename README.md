# PhonesNBO

The iPhone cases shop, its order system and the admin dashboard. It's plain Node with no packages to install, and Railway runs it with `npm start`.

- Shop: `/`
- Admin dashboard: `/admin`

## Railway setup (one time)

1. Push this folder to a GitHub repo and create a Railway service from it.
2. **Variables** → add:
   - `ADMIN_PASSWORD`: the password for `/admin`. Use a long one.
   - `DATA_DIR` = `/data`
3. **Add a Volume** to the service, mounted at `/data`. Orders and settings are saved there. **Without a volume, every redeploy wipes your orders.**
4. Deploy, then open `/admin` and log in.
5. In the dashboard, go to **Settings** and add the PhonesNBO WhatsApp number. Check prices under **Products** and fees under **Delivery**.

## How ordering works

- Customers order on the site and pay on delivery (cash or M-Pesa).
- Orders placed before **3pm Nairobi time** are promised for **same-day** delivery. Later orders go out on the next delivery day. You can change the cutoff and delivery days under **Delivery**.
- "Outside Nairobi" orders go by courier and never get a same-day promise.
- Each order moves through **New → Confirmed → Out for delivery → Delivered**, and you record M-Pesa or cash when you're paid.

## Changing the catalog

`public/catalog.js` holds the iPhone models, case styles, colours and delivery areas. Edit it to add a new model or case style. Prices, stock, fees and the WhatsApp number can all be changed from `/admin` without touching code.

Phone photos are in `public/images/`. To add a photo of a case, put it in that folder and add `img: 'images/your-file.png'` to the case colour in `catalog.js`.

## Data

- `DATA_DIR/orders.json`: all orders
- `DATA_DIR/settings.json`: what you changed in the dashboard
- `DATA_DIR/secret.json`: signs admin logins. Don't share it.

Download every order as a spreadsheet from **Orders → Download CSV**.

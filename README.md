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

## Managing products and stock (all from /admin)

- **Products:** add a case, edit its name, price, type, label and description, add or remove colours, upload a photo per colour, choose which iPhones it fits, hide it, or delete it. The arrows set the order on the shop.
- **Stock:** switch on "Count stock" for a case, then type how many you have for each iPhone and colour. Orders take stock off, and cancelling an order puts it back. A box at 0 shows as sold out on the shop. Low and sold-out items appear on the Overview.
- **iPhone models:** add a new model with its photo and size, edit or delete one, hide it, or reorder the picker.

Photos you upload are saved in `DATA_DIR/uploads`, so they need the Railway volume too.

`public/catalog.js` holds the starting catalog. The first time the server runs, it copies that into `DATA_DIR/catalog.json`, and from then on the dashboard is the source of truth.

## Data

- `DATA_DIR/orders.json`: all orders
- `DATA_DIR/catalog.json`: products, colours, stock and iPhone models
- `DATA_DIR/uploads/`: photos uploaded in the dashboard
- `DATA_DIR/settings.json`: delivery fees, cutoff and WhatsApp number
- `DATA_DIR/secret.json`: signs admin logins. Don't share it.

Download every order as a spreadsheet from **Orders → Download CSV**.

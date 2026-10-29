-- Whether phones show "pay with Google Pay / PhonePe / Paytm" buttons (UPI
-- links). UPI declines link payments to a business UPI ID that is not yet
-- verified ("Payment failed as per UPI risk policy"), but accepts a scan of its
-- QR, also from a photo in the gallery. So the buttons start off: phones show
-- "Save QR to gallery" and how to scan it from the UPI app. The admin turns
-- them on in /admin Settings once the business is verified.

alter table public.app_settings add column if not exists upi_app_buttons boolean not null default false;

notify pgrst, 'reload schema';

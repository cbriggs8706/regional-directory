# Regional Directory

A private, mobile-first directory for people serving in Church callings. The unit hierarchy is Region → Coordinating Council → Stake → Ward or Branch. The database supports multiple regions and shared calling titles across units at the same level.

## Local setup

1. Install Bun and run `bun install --frozen-lockfile`. Copy `.env.example` to `.env.local`. Next.js uses Node.js 20.9 or newer.
2. In the Supabase SQL Editor, apply the migrations in [supabase/migrations](supabase/migrations) in filename order. For an existing database, apply the migrations that are still pending before deploying the app update. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` using that project's settings.
3. Configure [Google sign-in in Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google). In Google Cloud, use the Supabase OAuth callback URL displayed on the Google provider page as the authorized redirect URI. Enable Google in Supabase. On a dedicated project you can disable unused providers. On a shared project, keep any providers other apps need. The directory requires Google sign-in independently of those settings.
4. In Supabase Authentication → URL Configuration, add `http://localhost:3000/auth/callback` to Redirect URLs. On deployment, set the Site URL, `APP_URL`, and an exact `/auth/callback` redirect URL for the deployed origin.
5. In the Supabase SQL Editor, run the following after substituting your own Google account email. Only this account can grant or revoke access under **Access**.

   ```sql
   insert into public.directory_access (email, is_admin)
   values (lower('your-google-account@example.com'), true);
   ```

6. To send directly from the directory, set `RESEND_API_KEY` to a sending key and `RESEND_FROM` to an address on a verified Resend domain, optionally with a display name such as `Regional Directory <directory@example.com>`. Replies go to the signed-in sender. Copying addresses for Gmail works without Resend.
7. Run `bun run dev` and open [localhost:3000](http://localhost:3000). Open **Access** as the administrator to approve additional Google accounts.

## Directory workflow

- In **Units**, coordinating councils open to show their stakes. Expand a stake to see its wards and branches. When multiple regions exist, use the region selector above the tree. A branch shares the ward-level calling types.
- Use **Add units** on a stake to enter several wards and branches together. Type or paste one name per line in the corresponding field. Existing units and repeated names of the same type are skipped.
- In **Units → Languages**, add or rename a language for use across regions. Edit a ward or branch to choose its language, record its local sacrament meeting time and whether sacrament meeting comes first, and add optional notes.
- In a ward or branch, choose **No** for **Is sacrament meeting first?** to enter the first meeting’s start time. You can also enter a council start time.
- Expand a stake and choose **Add conference** to record a begin date and an end date. The stake keeps all its conference dates together.
- Edit a stake, ward, or branch to add its **Website URL**. The link opens from the Units tree.
- Under **Units → Buildings**, add a building's street address. Edit a unit to select its building. Units under different stakes can share a building.
- **Visits** opens to a rolling three months of Sundays, one date per row. Switch to **Month** or **Week**, or turn on **All days** to include weekdays and Saturdays.
- Filter units by unit hierarchy or language, including sub-congregations. Drag a unit onto a date or choose **Schedule**. Each saved sacrament or council start time becomes a one-hour event. Drag the left or right edge of an event to change its time, or open it to edit the times directly.
- Click a time on the calendar to add a personal driving block. Set your start and end times and optionally name the trip. The calendar uses Mountain Time, and **Show other users’ visits** displays team events alongside yours.
- If a ward or branch includes a sub-congregation that speaks another language, check that option when editing the unit and select the sub-congregation’s language.
- Create calling titles in **Callings**. Every stake or ward-level title automatically appears in units of that level. Ward-level titles also appear in branches.
- Choose **Reorder** in the Stake or Ward / Branch section of **Callings**. Drag the titles or use the arrows, then choose **Save order**. The order applies to all units at that level.
- In **Units**, choose **View callings** for a stake, ward, or branch. Select **Add holder** to choose an existing person or create one. When adding a new person, you can paste the Name, Phone, and Email cells from Google Sheets into **Full name**. Use **FH Assignment** on the person’s assignment. Calling settings can allow multiple current holders.
- In **People → Add contact**, paste three adjacent Google Sheets cells into **Full name** in Name, Phone, Email order. Review the filled fields, then save. You can also enter contacts manually.
- Assign contacts from their calling's unit. Contacts can have multiple assignments. To replace a holder, enter the previous holder's released date and add the next person. An empty released date means the assignment is current. An empty sustained date means the start date is unknown.
- Edit a calling type's title to rename it across its units. Previous titles and the title recorded when a person was assigned remain visible. For reorganizations, create the new calling, release the old holders, and retire the old calling in its unit. You can link the replacement when retiring it.
- In **People**, choose one or more calling filters and optionally a unit. Select everyone shown with an email address or check people individually. Choose **Copy email addresses** and paste the list into a Gmail draft. Use **Bcc** to keep recipients’ addresses private. If you configured Resend, **Compose email** sends each distinct address a private copy directly from the directory.
- If a send is interrupted, reopen **Email** to resume a recent unfinished send. The provider's response indicates acceptance for sending. Delivery outcomes are available in the Resend dashboard.

Spreadsheet import can be added once the source columns and layout are ready.

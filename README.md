# Regional Directory

A private, mobile-first directory for people serving in Church callings. The unit hierarchy is Region → Coordinating Council → Stake → Ward or Branch. The database supports multiple regions and shared calling titles across units at the same level.

## Local setup

1. Run `npm ci` and copy `.env.example` to `.env.local`. Use Node.js 20.9 or newer.
2. In the Supabase SQL Editor, run [the directory migration](supabase/migrations/202611220001_directory.sql) once in the project that will hold the directory. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local` using that project's settings.
3. Configure [Google sign-in in Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google). In Google Cloud, use the Supabase OAuth callback URL displayed on the Google provider page as the authorized redirect URI. Enable Google in Supabase. On a dedicated project you can disable unused providers. On a shared project, keep any providers other apps need. The directory requires Google sign-in independently of those settings.
4. In Supabase Authentication → URL Configuration, add `http://localhost:3000/auth/callback` to Redirect URLs. On deployment, set the Site URL, `APP_URL`, and an exact `/auth/callback` redirect URL for the deployed origin.
5. In the Supabase SQL Editor, run the following after substituting your own Google account email. Only this account can grant or revoke access under **Access**.

   ```sql
   insert into public.directory_access (email, is_admin)
   values (lower('your-google-account@example.com'), true);
   ```

6. For email, set `RESEND_API_KEY` to a sending key and `RESEND_FROM` to an address on a verified Resend domain, optionally with a display name such as `Regional Directory <directory@example.com>`. Replies go to the signed-in sender. Email setup is independent of directory CRUD.
7. Run `npm run dev` and open [localhost:3000](http://localhost:3000). Open **Access** as the administrator to approve additional Google accounts.

## Directory workflow

- Add units from the top down in **Units**. A branch shares the ward-level calling types.
- In **Callings**, create a calling type, then choose **Add to unit** for every unit where it applies. Each unit can allow one or multiple current holders.
- Add people in **People**, then assign them from their calling's unit. Contacts can have multiple assignments. To replace a holder, enter the previous holder's released date and add the next person. An empty released date means the assignment is current. An empty sustained date means the start date is unknown.
- Edit a calling type's title to rename it across its units. Previous titles and the title recorded when a person was assigned remain visible. For reorganizations, create the new calling, release the old holders, and retire the old calling in its unit. You can link the replacement when retiring it.
- In **People**, choose one or more calling filters and optionally a unit. Select everyone shown with an email address or check people individually. Review recipients in **Compose email**, then enter the subject and message. Each distinct address receives a private copy.
- If a send is interrupted, reopen **Email** to resume a recent unfinished send. The provider's response indicates acceptance for sending. Delivery outcomes are available in the Resend dashboard.

Spreadsheet import can be added once the source columns and layout are ready.

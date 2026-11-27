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
7. Run `bun run dev` and open [localhost:3000](http://localhost:3000). Open **More → Admin** to grant council access, edit existing assignments, or preview a member’s directory in read-only mode.

The council access migration starts existing members with all coordinating councils present when the migration runs. It does not automatically add newly created councils to their access. Member dashboards aggregate only their assigned councils. Existing contacts and buildings without a unit or organization link are visible to the administrator until linked.

## Family History dashboard

- The homepage opens to the regional overview for the latest saved reporting month. The filters select a different month, stake, or ward/branch. After choosing a stake or a ward/branch, use **Compare with** to view another unit at the same level.
- Choose **Enter report**, then select a ward or branch and month. Enter the year-to-date figures shown in the PDF. In the submitter breakdown, enter the submitter count and eligible member count from each fraction. For an older report that provides a percentage, enter the percent sign. Leave unknown figures blank and enter zero when the report shows an actual zero. Select a saved ward or branch and month to correct its report.
- Stake and regional totals use the ward and branch reports for the selected month. Counts are summed once per unit and month. Submitter percentages divide the combined submitter count by combined eligible membership. Older percentages and four-generation rates weighted using total eligible membership are marked as estimates. Use the displayed counts and coverage to check the results against the stake PDF.

## Directory workflow

- In **Units**, coordinating councils open to show their stakes. Expand a stake to see its wards and branches. When multiple regions exist, use the region selector above the tree. A branch shares the ward-level calling types.
- From **Units**, open the parent unit’s page and click the pencil next to its name. A region has **Add coordinating councils**, a coordinating council has **Add stakes**, and a stake has **Add wards and branches**. Type or paste one name per line. Existing units and repeated names of the same type are skipped.
- In **Units → Languages**, add or rename a language for use across regions. Edit a ward or branch to choose its language, record its local sacrament meeting time and whether sacrament meeting comes first, and add optional notes.
- In a ward or branch, choose **No** for **Is sacrament meeting first?** to enter the first meeting’s start time. You can also enter a council start time.
- On a stake, ward, or branch page, choose **Add conference** to record begin and end dates. Stake dates also appear on that stake’s ward and branch pages. Ward and branch dates appear on their own unit pages.
- Edit a stake, ward, or branch to add its **Website URL**. The link opens from the Units tree.
- Under **Units → Buildings**, enter the building's street address, city, state, and ZIP code. State starts at **ID** and can be edited. Choose the **Agent Stake** that oversees the building and optionally upload a JPEG, PNG, or WebP picture up to 4 MB. Pictures are stored in the private Supabase `buildings` bucket. Fill in missing city and ZIP information when editing older building records. Edit a unit to select its building. Units under different stakes can share a building.
- **Calendar** shows stake, ward, and branch conferences alongside organization events. Turn on **Show my visits** to include your own visit planner events.
- **More → My Calendar** displays your visits and private events in a month grid on desktop and a date-grouped list on mobile. Use the bottom **+** to add a visit or a private all-day event. When scheduling a unit visit, you can use its saved sacrament and council meeting times. Select a visit or event to edit or remove it.
- If a ward or branch includes a sub-congregation that speaks another language, check that option when editing the unit and select the sub-congregation’s language.
- In **Callings**, add an organization such as Bishopric or Relief Society and choose its level. Add callings within that organization, or edit a calling to move it to another organization. Organization headings and calling titles are shared by units at the same level. Ward-level organizations also appear in branches.
- Edit an organization’s **Display order** to move its heading. Choose **Reorder** inside an organization to arrange its callings. Every active calling supports multiple current holders. Use **Add another holder** to assign someone alongside the current holders.
- On a unit’s **Callings** tab, open **Manage callings** under the organization, then choose **Add holder**. Pick an existing person or create one. When creating a person, you can paste the Name, Phone, and Email cells from Google Sheets into **Full name**. Enter comma-separated labels in **Assignments** to show them as badges on that person’s calling card.
- In **People → Add contact**, paste three adjacent Google Sheets cells into **Full name** in Name, Phone, Email order. Review the filled fields, then save. You can also enter contacts manually.
- Assign contacts from their calling's unit. Contacts can have multiple assignments. To replace a holder, enter the previous holder's released date and add the next person. An empty released date means the assignment is current. An empty sustained date means the start date is unknown.
- Edit a calling type's title to rename it across its units. Previous titles and the title recorded when a person was assigned remain visible. For reorganizations, create the new calling, release the old holders, and retire the old calling in its unit. You can link the replacement when retiring it.
- In **People**, choose one or more calling filters and optionally a unit. Select everyone shown with an email address or check people individually. Choose **Copy email addresses** and paste the list into a Gmail draft. Use **Bcc** to keep recipients’ addresses private. If you configured Resend, **Compose email** sends each distinct address a private copy directly from the directory.
- If a send is interrupted, reopen **Email** to resume a recent unfinished send. The provider's response indicates acceptance for sending. Delivery outcomes are available in the Resend dashboard.

Spreadsheet import can be added once the source columns and layout are ready.

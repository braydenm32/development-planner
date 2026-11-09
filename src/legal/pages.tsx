// The words of About, Privacy, Terms and How accurate is this? Plain Australian English, "we"
// for Contour & Gable. The facts about what is kept come from the code (worker/src, the
// migrations, src/projects) and are listed in the pull request for a lawyer to check.

import type { ReactNode } from 'react'
import { ACCURACY_TITLE, CONTACT_EMAIL, STORAGE_LIMIT_MB } from './caveat'
import type { PageId } from '../nav/route'

/** A heading and what's under it, as one section, so a long page can be scanned. */
const S = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <section aria-labelledby={`lg-${id}`}>
    <h2 id={`lg-${id}`}>{title}</h2>
    {children}
  </section>
)

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
const Go = ({ to, children }: { to: PageId; children: ReactNode }) => <a href={`#/${to}`}>{children}</a>

export function About() {
  return (
    <>
      <p className="lg-lede">Contour &amp; Gable is a planning aid for people building a house on a sloping block in New South Wales.</p>
      <S id="does" title="What it does">
        <ul>
          <li>Reads your surveyor’s contour file (DXF) and builds the block in 3D, or lets you sketch a block without a survey.</li>
          <li>Lets you draw a house plan on it: walls, doors, windows, floors, roofs, stairs, decks and retaining walls.</li>
          <li>Works out cut and fill for the pad, driveway and batters, and how much earth to move.</li>
          <li>Checks the plan against NSW planning rules (the Housing Code and one council’s local rules so far).</li>
          <li>Gives a rough cost, line by line, from NSW figures you can change.</li>
          <li>Makes PDF plans and 3D-printable models, and view-only links you can send to a builder, a neighbour or your family.</li>
        </ul>
      </S>
      <S id="who" title="Who it’s for">
        <p>People at the start of a build: owner-builders, first-home builders and anyone getting ready to talk to a designer, council, certifier or builder. It helps you see what your block allows and ask better questions. It is not for building from.</p>
      </S>
      <S id="aid" title="A planning aid, not advice">
        <p>
          Contour &amp; Gable is a concept planning aid. It is not a surveyor, engineer, certifier, architect or building designer, and its results are estimates. Read{' '}
          <Go to="accuracy">{ACCURACY_TITLE}</Go> to see what each result is good for and where it stops.
        </p>
      </S>
      <S id="maker" title="Who makes it">
        <p>A small independent maker, working alone and in the open. We’re not part of a builder, a council or a software company, and we don’t sell your data or show ads. It’s open to a few people by invite while we get it right.</p>
      </S>
      <S id="contact" title="Contact">
        <p>
          Questions, bugs, ideas, or a request about your information: <Mail />. We read everything and answer when we can.
        </p>
        <p>
          More: <Go to="privacy">Privacy</Go>, <Go to="terms">Terms</Go>, <Go to="accuracy">{ACCURACY_TITLE}</Go>.
        </p>
      </S>
    </>
  )
}

export function Privacy() {
  return (
    <>
      <p className="lg-lede">Short version: your survey and plans stay in your browser unless you sign in to save to the cloud. We don’t run analytics or ads, and we don’t sell or share your information.</p>
      <S id="here" title="Without an account">
        <p>
          Your projects, surveys and plans are kept in your browser, in its own storage (IndexedDB). They don’t leave your device, and we never see them. If you clear this site’s data, or use a private window, they can be lost, so download a project file now and then. You can use the planner this way for as long as you like.
        </p>
      </S>
      <S id="cloud" title="If you sign in">
        <p>
          Signing in saves your projects to the cloud so they follow you between devices. It runs on Cloudflare (Workers, D1 and KV), so your data is stored by Cloudflare, who run data centres in many countries. We keep:
        </p>
        <ul>
          <li>your account name, as you typed it;</li>
          <li>the email address you add for sign-in, if you add one;</li>
          <li>which invite code you signed up with (its label, or a short fingerprint of it), so a code that’s been passed around can be stopped;</li>
          <li>the public key of each passkey you’ve added, and when it was made and last used. The private key never leaves your device;</li>
          <li>a hash of your recovery code (not the code itself);</li>
          <li>your sign-in sessions, as hashes of their tokens;</li>
          <li>your projects and everything in them: survey, plan, site features, costs, and each project’s settings;</li>
          <li>your view-only links: a hash of each link’s token, when it was made, last opened and ended or expires (not who opened it);</li>
          <li>comments left on your links that take them (see below);</li>
          <li>short-lived counters to slow down guessing and abuse, which can include your IP address or a fingerprint (hash) of an email address, and are cleared after a day or so.</li>
        </ul>
        <p>Like any web host, Cloudflare handles your IP address and the usual request details to deliver the page. We don’t use them to identify you.</p>
      </S>
      <S id="maps" title="The NSW map and ground levels">
        <p>
          If you look up your block on the map (Site › Map, or start from an address), what you type and the lot’s position go to NSW Government map services to find the lot and read its planning maps. If you use the state’s ground levels, points over the lot (as longitude and latitude) go to the NSW Spatial Services elevation service to read its levels. Nothing is sent until you ask, and nothing else about you goes with it. The lot’s position stays with the project and is never in a view-only link.
        </p>
      </S>
      <S id="cookies" title="Cookies, analytics and ads">
        <p>There are no analytics, no ads and no tracking cookies. When you’re signed in there is one session cookie, which keeps you signed in for up to 30 days and does nothing else. The app also keeps a few settings (like your last view) in your browser.</p>
      </S>
      <S id="links" title="View-only links">
        <p>
          A view-only link shows the survey and plan of that project to anyone who has the link, with no sign-in. Share it only with people you’re happy to see your block and house. You can end a link at any time from the project, and links stop working when you delete your account. A link’s page asks search engines not to list it and doesn’t pass on where the visitor came from.
        </p>
        <p>
          If you tick Comments on a link, anyone with it can pin a short note on the plan for you. For each comment we keep its text, where on the plan it sits, the name the commenter chose to give (if any), when it was left and whether you’ve marked it done. To let them see their own comments again, their browser keeps a random token and we keep only a hash of it. We don’t ask for an email or sign-in, and we keep nothing else about them. You can delete a comment at any time. Comments go when you end the link (after a short while to undo) or delete your account.
        </p>
      </S>
      <S id="use" title="What we use it for">
        <p>
          Only to run the planner for you: to sign you in, save and show your projects, and keep the service safe. We don’t sell your information, use it for advertising, or share it, except with Cloudflare (to host it), Resend (to email your sign-in codes, if you add an email) and where the law requires.
        </p>
      </S>
      <S id="email" title="Email sign-in">
        <p>
          Email is a backup to your passkeys. If you add an email address to your account (Cloud saves, then Email for sign-in), we keep that address and use it only to send you 6-digit sign-in codes, and one code first to check the address is yours. Nothing else: no newsletters, no marketing.
        </p>
        <p>
          The emails go through Resend, a US company, so your address and the code go to the United States to be sent. We keep each code only as a hash. It works for 10 minutes, once, and is cleared away soon after.
        </p>
        <p>Remove the email from your account (or delete your account) and we remove the address.</p>
      </S>
      <S id="delete" title="Deleting your information">
        <p>
          You can delete your account from the account sheet (Cloud saves). It signs you out everywhere and stops your view-only links straight away, and after 30 days we delete the account and everything in the cloud for it. In those 30 days you can sign in and keep it. Projects on your own devices are yours to delete from the browser. To ask for anything else, write to <Mail />.
        </p>
      </S>
      <S id="law" title="The Australian Privacy Act">
        <p>
          We’re a small business and may not be bound by the Privacy Act 1988 (Cth), but we handle your information in the spirit of the Australian Privacy Principles: we collect only what we need, tell you what it’s for, keep it secure, and let you see, correct and delete it. If you ask, we’ll tell you what we hold about you and fix or remove it. If you’re unhappy with how we’ve handled something, write to <Mail /> and we’ll respond within 30 days. You can also complain to the Office of the Australian Information Commissioner (oaic.gov.au).
        </p>
      </S>
      <S id="changes" title="Changes">
        <p>
          If this changes in a way that matters, we’ll say so in the app before it takes effect. Questions: <Mail />.
        </p>
      </S>
    </>
  )
}

export function Terms() {
  return (
    <>
      <p className="lg-lede">Plain terms for using Contour &amp; Gable. By using it, or creating an account, you agree to them.</p>
      <S id="what" title="What this is">
        <p>
          Contour &amp; Gable is a concept planning aid. It is not professional advice, and we are not a surveyor, engineer, certifier, architect or building designer. Its checks, cut and fill, costs and plans are estimates to help you think and ask questions (see <Go to="accuracy">{ACCURACY_TITLE}</Go>).
        </p>
      </S>
      <S id="you" title="Checking is up to you">
        <p>
          Before you rely on anything it shows, build from it, spend money on it, lodge an application, or give it to a builder, you are responsible for checking it with your council, a certifier, an engineer, your surveyor and your builder. Don’t build from these plans. Check dimensions, levels and quantities on site.
        </p>
      </S>
      <S id="access" title="Invite only, for now">
        <p>Accounts are open by invite while we’re small. You can use the planner on your own device without an account. We may change who can sign up, and what the service includes, at any time.</p>
      </S>
      <S id="account" title="Your account">
        <p>Keep your passkey and your recovery code safe: the recovery code is the only way back in if you lose your passkeys, and we can’t recover a project from an account you can’t open. Give us a true name for your account and don’t share it. You’re responsible for what’s done in it.</p>
      </S>
      <S id="yours" title="Your work">
        <p>Your surveys, plans and projects stay yours. You give us permission only to store and show them to you, and to anyone you give a view-only link to, so the service works. Make sure you’re allowed to use what you upload (for example, a survey you’ve been given to use).</p>
      </S>
      <S id="use" title="Acceptable use">
        <ul>
          <li>Use it lawfully, and for your own planning or for people you’re working with.</li>
          <li>Don’t try to break, overload, probe or get round the service, its limits or other people’s accounts.</li>
          <li>Don’t upload malware, or anything unlawful, or that you have no right to share.</li>
          <li>Don’t use view-only links to share anyone’s information without their say-so.</li>
        </ul>
      </S>
      <S id="storage" title="Storage">
        <p>Each account may keep up to {STORAGE_LIMIT_MB} MB in the cloud. That’s plenty for several projects. If you reach it, saving to the cloud stops until you free space; your work on your device is not affected. We may change the limit.</p>
      </S>
      <S id="suspend" title="Suspending accounts">
        <p>We may suspend or close an account that breaks these terms or puts the service or other people at risk, and we’ll tell you why where we can. You can delete your account at any time (see <Go to="privacy">Privacy</Go>).</p>
      </S>
      <S id="asis" title="No promises, and limits on our liability">
        <p>
          The service is provided as is. We try to keep it working and the results sensible, but we can’t promise it will be always available, error-free or fit for your particular block or project. To the extent the law allows, we’re not liable for any loss or damage from using it, or from relying on its results, including building, design, approval or cost decisions. Nothing here limits rights you have under the Australian Consumer Law that can’t be excluded. Where the law lets us limit our liability for a breach of a consumer guarantee, we limit it to supplying the service again or paying for it to be supplied again.
        </p>
      </S>
      <S id="law" title="NSW law">
        <p>These terms are governed by the law of New South Wales, Australia, and the courts of New South Wales.</p>
      </S>
      <S id="changes" title="Changes and contact">
        <p>
          We may update these terms; if the change matters we’ll say so in the app. Using the service after that means you accept it. Questions: <Mail />.
        </p>
      </S>
    </>
  )
}

export function Accuracy() {
  return (
    <>
      <p className="lg-lede">Contour &amp; Gable is a concept planning aid. Everything it shows is an estimate built from the information you give it. Here is what each result is good for, and where it stops.</p>
      <S id="terrain" title="The terrain, from your survey">
        <p><b>Good for:</b> seeing the shape of your block, its fall, and where a house could sit. It follows your surveyor’s contours, spot levels and boundary.</p>
        <p><b>Limits:</b> the ground is a smooth surface drawn between the surveyed points, so it can differ from the real ground between them. It’s only as good as the survey: its age, its detail and which layers were read. A sketched block (no survey) is a rough shape from a few numbers, not a measurement. Levels are to the survey’s own datum. It isn’t a substitute for a current survey by a registered surveyor.</p>
      </S>
      <S id="state-levels" title="Ground levels from the state’s elevation model">
        <p><b>Good for:</b> a first look at a block before you buy, or before the survey comes: which way it falls and roughly how much.</p>
        <p><b>Limits:</b> without a survey, the planner can read the ground from the NSW 5 m elevation model (made from LiDAR and aerial photos). NSW Spatial Services state it’s accurate to about ±0.9 m (95% of points), on a 5 m grid of bare earth, so walls, cuttings, kerbs and anything smaller than a few metres don’t show. The lot’s lines come from the cadastre, which can be out by a metre or more. Cut and fill, retaining walls, floor levels and the checks worked out on these levels are a rough guide only: don’t use them for design, earthworks quantities or a price. Get a survey by a registered surveyor before you rely on any of it; it replaces these levels and keeps your plan.</p>
      </S>
      <S id="earth" title="Cut and fill">
        <p><b>Good for:</b> comparing designs and getting a feel for how much earth moves.</p>
        <p><b>Limits:</b> volumes come from a grid over the terrain, with your batter slopes and the pad levels you set. They are measured in the ground: soil bulks up by roughly a quarter once it’s dug, so trucks and tips see more. They don’t allow for topsoil, rock, compaction of fill, trenches, footings, pier holes or services. Real quantities depend on a geotechnical report and what your excavator finds. Treat them as rough, not as an order.</p>
      </S>
      <S id="retaining" title="Retaining walls">
        <p><b>Good for:</b> seeing where walls are likely, and about how tall.</p>
        <p><b>Limits:</b> heights are measured from the modelled ground. The planner flags any wall over 1.0 m as needing an engineer. Walls under that can still need design, drainage and, in some places, approval. We don’t design walls, footings or drainage.</p>
      </S>
      <S id="checks" title="Planning checks">
        <p><b>Good for:</b> a first look at whether the plan is near the NSW Housing Code (Complying Development) limits, or one council’s local rules (Wollongong so far): setbacks, height, floor area, storeys, landscaping, earthworks and retaining walls, tree protection.</p>
        <p><b>Limits:</b> the rules are written down from public sources at a point in time and can change. A check marked as passing is not an approval, and a council or certifier may read the rules differently. A check needs the right inputs (the lot type, the street side, the council), and some say “can’t check yet” until you give them. What they don’t cover, and the list under the checks says so:</p>
        <ul>
          <li>whether your land can use a complying development certificate at all (zone, heritage, flood, bushfire and other exclusions);</li>
          <li>council rules beyond the council(s) the planner knows, zoning maps, overlays and easements;</li>
          <li>private open space, privacy, garages and parking, sun to neighbours, fences, pools;</li>
          <li>BASIX, bushfire, flood, heritage, services and anything particular to your site.</li>
        </ul>
      </S>
      <S id="costs" title="Costs">
        <p><b>Good for:</b> a rough budget and comparing choices, line by line, in NSW dollars including GST.</p>
        <p><b>Limits:</b> starting rates are rough NSW figures from public guides, set in November 2026, and prices move. The estimate shows a likely range of 20% either way, and the real cost can fall outside it. A quote you type in replaces a line’s estimate. It doesn’t include land, finance, furniture, landscaping beyond what you’ve drawn, or anything you haven’t drawn, and fees and allowances are rough. Get quotes from builders and trades before you commit.</p>
      </S>
      <S id="prints" title="3D prints">
        <p><b>Good for:</b> a model of the block and house to look at, hold and discuss.</p>
        <p><b>Limits:</b> it’s a simplified model at the scale you pick. Details are left out, and small parts may not print well on every printer. It’s not a drawing, and it’s not for building from.</p>
      </S>
      <S id="pdf" title="PDF plans">
        <p><b>Good for:</b> sharing your concept with a designer, a builder or your family.</p>
        <p><b>Limits:</b> they’re concept plans, not construction or council drawings, and the scale is right only if printed at the paper size it says. Check every dimension and level on site before building. Each sheet carries this reminder.</p>
      </S>
      <S id="sure" title="When you’re not sure">
        <p>
          Ask your council, a certifier, an engineer, a registered surveyor and your builder. If you think we’ve got something wrong, we’d like to know: <Mail />.
        </p>
      </S>
    </>
  )
}

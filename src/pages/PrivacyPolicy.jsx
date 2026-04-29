import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/**
 * Privacy Policy — public route at /privacy.
 *
 * Required by Google for any application using the YouTube Data API.
 * The reviewer pastes this URL into a browser and verifies it loads
 * for an unauthenticated visitor — keep it on a public route.
 */
export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white text-gray-800">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-8"
        >
          <ArrowLeft size={14} /> Back to home
        </Link>

        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">
          Last updated: April 28, 2026
        </p>

        <div className="prose prose-sm max-w-none space-y-6 leading-relaxed text-[15px]">
          <p>
            This Privacy Policy explains how <strong>Kaizer News</strong>
            (&ldquo;<strong>Kaizer</strong>&rdquo;, &ldquo;<strong>we</strong>&rdquo;,
            &ldquo;<strong>us</strong>&rdquo;, &ldquo;<strong>our</strong>&rdquo;) collects, uses,
            stores, and discloses information when you use our SaaS
            platform at <strong>kaizerfrontned-production.up.railway.app</strong> and the related
            services (the &ldquo;<strong>Service</strong>&rdquo;).
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">1. Who we are</h2>
          <p>
            Kaizer News is a software-as-a-service platform that helps
            YouTube creators turn long-form videos into platform-native
            short clips and publish them to their own YouTube channels.
            You can contact us at{" "}
            <a href="mailto:devsharkify@gmail.com" className="text-red-600 underline">
              devsharkify@gmail.com
            </a>.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">2. Information we collect</h2>
          <p>We collect only what is necessary to run the Service:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Account data</strong> — email address, name, hashed
              password (we never store your password in plain text), and
              your plan tier.
            </li>
            <li>
              <strong>Content you upload</strong> — videos, images, logos
              you provide for processing, and any metadata you enter such
              as titles, descriptions, and tags.
            </li>
            <li>
              <strong>YouTube data (with your explicit consent only)</strong>{" "}
              — when you click &ldquo;Link my YouTube&rdquo;, you go through
              Google&rsquo;s standard OAuth 2.0 consent screen. After you grant
              permission, we receive a <em>refresh token</em> that lets us
              upload videos to the channel(s) you authorised. We also store
              the channel&rsquo;s public ID and title so we can show you which
              channel is connected.
            </li>
            <li>
              <strong>Operational data</strong> — basic logs of API requests,
              errors, and usage metrics so we can keep the service running.
            </li>
          </ul>

          <h2 className="text-xl font-semibold mt-10 mb-3">3. How we use your information</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>To process your videos through our pipeline (cut clips, generate captions, generate SEO metadata).</li>
            <li>To upload videos to your YouTube channel(s) when you click Publish.</li>
            <li>To show you the status of pending and completed uploads.</li>
            <li>To provide customer support when you contact us.</li>
            <li>To bill you according to your plan.</li>
            <li>To comply with legal obligations.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-10 mb-3">4. YouTube API Services</h2>
          <p>
            Our use of information received from YouTube APIs adheres to
            the{" "}
            <a
              href="https://developers.google.com/youtube/terms/api-services-terms-of-service"
              target="_blank"
              rel="noreferrer"
              className="text-red-600 underline"
            >
              YouTube API Services Terms of Service
            </a>
            , and our handling of any data we obtain from Google APIs is
            governed by the{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noreferrer"
              className="text-red-600 underline"
            >
              Google Privacy Policy
            </a>
            .
          </p>
          <p>
            We use the following YouTube Data API v3 scopes only:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li><code>https://www.googleapis.com/auth/youtube.upload</code> — to upload your processed clips.</li>
            <li><code>https://www.googleapis.com/auth/youtube.readonly</code> — to read your channel&rsquo;s name and ID after you connect.</li>
            <li><code>https://www.googleapis.com/auth/youtube</code> — to update video metadata and set custom thumbnails.</li>
          </ul>
          <p>
            We do not request access to your subscribers, your viewers&rsquo;
            data, comments, livestreams, analytics, or any other YouTube
            surface beyond what is listed above.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">5. How to revoke access</h2>
          <p>
            You may revoke our access to your YouTube account at any time by:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Clicking <strong>Disconnect</strong> on the Style Profiles page in
              the Kaizer News app, which immediately deletes our stored refresh
              token; or
            </li>
            <li>
              Visiting{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="text-red-600 underline"
              >
                https://myaccount.google.com/permissions
              </a>{" "}
              and removing access for &ldquo;Kaizer News&rdquo;.
            </li>
          </ul>

          <h2 className="text-xl font-semibold mt-10 mb-3">6. How we store and protect your data</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>OAuth refresh tokens</strong> are encrypted at rest
              using AES-256 (via the <code>cryptography.fernet</code>
              library) before being written to our database. The decryption
              key is stored only in our production environment, never in
              source control.
            </li>
            <li>
              <strong>Access tokens</strong> are minted on demand from the
              encrypted refresh token, used for one API call, and discarded.
              We never persist them.
            </li>
            <li>
              <strong>Passwords</strong> are hashed with bcrypt (cost factor 12)
              and never stored in plain text.
            </li>
            <li>
              <strong>Uploaded files</strong> are stored on Cloudflare R2
              (TLS in transit, encryption at rest).
            </li>
            <li>
              <strong>All data in transit</strong> uses HTTPS / TLS 1.2 or
              higher.
            </li>
          </ul>

          <h2 className="text-xl font-semibold mt-10 mb-3">7. Third-party services we use</h2>
          <p>We rely on the following third parties to operate the Service:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Google / YouTube</strong> — to authenticate you and upload videos.</li>
            <li><strong>Google Gemini</strong> — to generate captions and SEO metadata from your video transcripts.</li>
            <li><strong>Cloudflare R2</strong> — to store your uploaded files.</li>
            <li><strong>Railway</strong> — to host our application.</li>
            <li><strong>Pexels</strong> — to source stock images when you do not provide a default image.</li>
          </ul>
          <p>
            We do not sell, rent, or trade your personal information. We do
            not share your data with advertisers.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">8. Data retention and deletion</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              <strong>Account data</strong> is retained for as long as your
              account is active.
            </li>
            <li>
              <strong>Uploaded videos and generated clips</strong> are
              retained until you delete the corresponding job in the app.
              Deleted files are permanently removed from our storage within
              24 hours.
            </li>
            <li>
              <strong>OAuth refresh tokens</strong> are deleted immediately
              when you click Disconnect or delete your account.
            </li>
            <li>
              <strong>Operational logs</strong> are retained for 30 days.
            </li>
            <li>
              You may delete your account at any time from the{" "}
              <strong>Settings → Account</strong> page. Deletion removes all
              your data within 24 hours, except where retention is required
              by law (e.g. tax records).
            </li>
          </ul>

          <h2 className="text-xl font-semibold mt-10 mb-3">9. Your rights</h2>
          <p>
            Depending on where you live, you may have rights to access,
            correct, port, or delete your personal data, and to object to
            or restrict certain processing. To exercise these rights,
            contact us at{" "}
            <a href="mailto:devsharkify@gmail.com" className="text-red-600 underline">
              devsharkify@gmail.com
            </a>
            . We respond within 30 days.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">10. Children</h2>
          <p>
            Kaizer News is not directed to children under 13 (or the
            applicable age in your country). We do not knowingly collect
            personal data from children. If you believe a child has
            provided us with personal data, contact us and we will delete
            it.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">11. International transfers</h2>
          <p>
            Our infrastructure is hosted in the United States. By using the
            Service you consent to your data being processed in the US,
            which may have data-protection laws different from those of
            your home country.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">12. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material
            changes will be notified via email and an in-app notice. The
            &ldquo;Last updated&rdquo; date at the top reflects the most recent revision.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">13. Contact</h2>
          <p>
            Questions about this policy? Email{" "}
            <a href="mailto:devsharkify@gmail.com" className="text-red-600 underline">
              devsharkify@gmail.com
            </a>
            .
          </p>
        </div>

        <div className="mt-16 pt-6 border-t border-gray-200 text-xs text-gray-400 text-center">
          © {new Date().getFullYear()} Kaizer News. All rights reserved.
        </div>
      </div>
    </div>
  );
}

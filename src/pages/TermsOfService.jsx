import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/**
 * Terms of Service — public route at /terms.
 *
 * Required by Google for any application using the YouTube Data API.
 * Must be reachable without authentication.
 */
export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-white text-gray-800">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-8"
        >
          <ArrowLeft size={14} /> Back to home
        </Link>

        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-8">
          Last updated: April 28, 2026
        </p>

        <div className="prose prose-sm max-w-none space-y-6 leading-relaxed text-[15px]">
          <p>
            These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) govern your
            use of <strong>Kaizer News</strong> (&ldquo;<strong>Kaizer</strong>&rdquo;,
            &ldquo;<strong>we</strong>&rdquo;, &ldquo;<strong>us</strong>&rdquo;, &ldquo;<strong>our</strong>&rdquo;)
            and any related services (the &ldquo;<strong>Service</strong>&rdquo;) operated by
            us. By creating an account or using the Service, you agree to
            be bound by these Terms.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">1. The Service</h2>
          <p>
            Kaizer News is a SaaS platform that helps YouTube creators
            transform long-form videos into short, vertical clips with
            AI-generated captions and SEO metadata, and publish those clips
            to YouTube channels they own and have authorised.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">2. Eligibility</h2>
          <p>
            To use the Service you must be at least 13 years old (or the
            age of digital consent in your country, if higher). You must
            have the legal authority to bind yourself to these Terms.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">3. Your account</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>You are responsible for all activity under your account.</li>
            <li>
              Keep your password and OAuth-connected account credentials
              confidential. Notify us at{" "}
              <a href="mailto:devsharkify@gmail.com" className="text-red-600 underline">
                devsharkify@gmail.com
              </a>{" "}
              of any unauthorised access.
            </li>
            <li>
              You may delete your account at any time from{" "}
              <strong>Settings → Account</strong>; we may suspend or
              terminate accounts that violate these Terms.
            </li>
          </ul>

          <h2 className="text-xl font-semibold mt-10 mb-3">4. YouTube and Google</h2>
          <p>
            By connecting a YouTube channel via Google&rsquo;s OAuth 2.0
            consent flow, you authorise us to upload videos and update
            metadata on that channel on your behalf. You agree:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              To comply with the{" "}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noreferrer"
                className="text-red-600 underline"
              >
                YouTube Terms of Service
              </a>
              {" "}and{" "}
              <a
                href="https://developers.google.com/youtube/terms/api-services-terms-of-service"
                target="_blank"
                rel="noreferrer"
                className="text-red-600 underline"
              >
                YouTube API Services Terms of Service
              </a>
              .
            </li>
            <li>
              That your use of any data obtained from Google APIs through
              the Service is governed by the{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noreferrer"
                className="text-red-600 underline"
              >
                Google Privacy Policy
              </a>
              .
            </li>
            <li>
              That you may revoke our access at any time via{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="text-red-600 underline"
              >
                myaccount.google.com/permissions
              </a>
              {" "}or the &ldquo;Disconnect&rdquo; button in our app.
            </li>
          </ul>

          <h2 className="text-xl font-semibold mt-10 mb-3">5. Your content</h2>
          <p>
            You retain all rights to the videos, images, logos, and other
            material you upload (&ldquo;<strong>Content</strong>&rdquo;). You grant us a
            limited, non-exclusive, royalty-free licence to host, process,
            transcode, and transmit your Content solely to provide the
            Service to you. We do not claim ownership of your Content and
            do not use it to train any AI model.
          </p>
          <p>You represent and warrant that:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>You own or have the right to upload and publish your Content.</li>
            <li>
              Your Content does not infringe any third-party copyright,
              trademark, privacy, or other right.
            </li>
            <li>
              Your Content complies with the YouTube Community Guidelines
              and all applicable laws.
            </li>
          </ul>

          <h2 className="text-xl font-semibold mt-10 mb-3">6. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Upload Content that is illegal, infringing, harassing, or harmful.</li>
            <li>Use the Service to automate spam, deceptive content, or any artificial inflation of YouTube metrics.</li>
            <li>Attempt to reverse-engineer, scrape, or extract source code from the Service.</li>
            <li>Use the Service to upload to a YouTube channel you do not own or are not authorised to manage.</li>
            <li>Bypass quotas, rate limits, or access controls.</li>
            <li>Use the Service to violate the YouTube API Services Terms of Service.</li>
          </ul>

          <h2 className="text-xl font-semibold mt-10 mb-3">7. Payments and plans</h2>
          <p>
            Some features of the Service require a paid subscription. By
            choosing a paid plan you agree to pay the fees described at
            checkout. Subscriptions renew automatically until cancelled.
            You can cancel at any time from <strong>Settings → Billing</strong>;
            cancellation takes effect at the end of the current billing
            period.
          </p>
          <p>
            We may change pricing with at least 30 days&rsquo; notice. Refunds
            are issued at our discretion.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">8. Intellectual property</h2>
          <p>
            The Service, including its software, design, branding, and
            documentation, is owned by Kaizer News and is protected by
            copyright, trademark, and other intellectual-property laws.
            Nothing in these Terms grants you any right to our trademarks.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">9. Disclaimers</h2>
          <p className="uppercase text-xs">
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
            warranties of any kind, express or implied. We disclaim all
            warranties including merchantability, fitness for a particular
            purpose, and non-infringement, to the maximum extent permitted
            by law.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">10. Limitation of liability</h2>
          <p className="uppercase text-xs">
            To the maximum extent permitted by law, Kaizer News and its
            officers, employees, and agents will not be liable for any
            indirect, incidental, special, consequential, or punitive
            damages, or for lost profits, revenue, or data, arising out of
            or related to your use of the Service. Our total liability for
            any claim is limited to the amount you paid us in the twelve
            months before the event giving rise to the claim, or USD 100,
            whichever is greater.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">11. Indemnity</h2>
          <p>
            You agree to defend and indemnify Kaizer News from any claim,
            loss, or expense (including reasonable legal fees) arising out
            of your Content, your breach of these Terms, or your violation
            of any third-party rights.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">12. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service at any
            time for any breach of these Terms. You may terminate your
            account at any time from the Settings page. Upon termination,
            your right to use the Service ends immediately. Sections 5
            (your rights to your Content), 8, 9, 10, and 11 survive
            termination.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">13. Governing law</h2>
          <p>
            These Terms are governed by the laws of India (or the
            jurisdiction in which Kaizer News is incorporated, if
            different), without regard to conflict-of-law principles. Any
            disputes will be resolved in the courts of that jurisdiction.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">14. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. Material changes
            will be notified via email and an in-app notice. Continued use
            of the Service after the changes take effect constitutes
            acceptance of the revised Terms.
          </p>

          <h2 className="text-xl font-semibold mt-10 mb-3">15. Contact</h2>
          <p>
            Questions about these Terms? Email{" "}
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

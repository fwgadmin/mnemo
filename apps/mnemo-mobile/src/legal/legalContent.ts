/**
 * In-app legal copy for Mnemo Mobile (distribution / store listings).
 * Update the effective date when you change substantive terms.
 */

export const LEGAL_EFFECTIVE_DATE = 'April 9, 2026';

export const PRIVACY_POLICY = `
Mnemo Mobile (“the App”) is provided by the Mnemo project. This Privacy Policy describes how information is handled when you use the App on your device.

Information you provide
• Database connection: If you enter a Turso (or compatible libSQL) URL, authentication token, and optional tenant identifier, those values are stored on your device so the App can connect to your chosen database. They are not sent to us as the app publisher unless you separately share them.
• Notes and content: Your notes, titles, tags, and related data are processed and stored according to your database provider’s terms and your own configuration. The App does not upload your note content to servers we operate solely because you installed the App.

Local storage and sync
• The App may cache notes and settings locally (including in secure storage where available) to improve performance and offline use.
• Category colors and UI preferences may be stored on the device and, if you use a remote database that supports key-value sync, merged with preferences stored there.

Network
• When online, the App communicates with the database endpoint you configure (for example Turso). That provider’s privacy policy governs data at rest and in transit on their systems.

Analytics and advertising
• The App does not include third-party advertising SDKs or behavioral analytics from the publisher of this policy. If you build a variant that adds analytics, disclose that separately.

Children
• The App is not directed at children under 13 (or the age required in your jurisdiction). Do not use the App to collect personal information from children without appropriate consent.

Changes
• We may update this policy. The effective date at the top will change when we do. Continued use of the App after changes constitutes acceptance of the updated policy.

Contact
• For privacy questions about this open-source client, use the contact or issue tracker published with the Mnemo repository you obtained the App from.
`.trim();

export const TERMS_OF_USE = `
By using Mnemo Mobile (“the App”), you agree to these Terms of Use.

The App is provided “as is” without warranty of any kind, express or implied. The authors and contributors are not liable for any loss of data, unauthorized access to your database credentials, or service interruption related to your use of third-party database services.

You are responsible for securing your Turso or libSQL credentials, complying with your database provider’s terms, and ensuring your use of the App complies with applicable laws.

You may not use the App solely to violate others’ rights or applicable export or sanctions rules.

These terms may be updated; the effective date in the App will be revised when they are. If you do not agree, discontinue use of the App.
`.trim();

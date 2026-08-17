-- AI Matching Bot sample data.
-- Run this AFTER supabase-deploy.sql.
-- Safe to rerun: it deletes only the sample phone numbers below before inserting.
--
-- Fake sample phones:
-- Freelancers: 923001110001 through 923001110006
-- Clients:     923002220001 through 923002220005

delete from contact_requests
where requester_phone in (
  '923001110001', '923001110002', '923001110003', '923001110004', '923001110005', '923001110006',
  '923002220001', '923002220002', '923002220003', '923002220004', '923002220005'
)
or target_phone in (
  '923001110001', '923001110002', '923001110003', '923001110004', '923001110005', '923001110006',
  '923002220001', '923002220002', '923002220003', '923002220004', '923002220005'
);

delete from match_feedback
where phone in (
  '923001110001', '923001110002', '923001110003', '923001110004', '923001110005', '923001110006',
  '923002220001', '923002220002', '923002220003', '923002220004', '923002220005'
);

delete from notifications
where phone in (
  '923001110001', '923001110002', '923001110003', '923001110004', '923001110005', '923001110006',
  '923002220001', '923002220002', '923002220003', '923002220004', '923002220005'
);

delete from insights
where phone in (
  '923001110001', '923001110002', '923001110003', '923001110004', '923001110005', '923001110006',
  '923002220001', '923002220002', '923002220003', '923002220004', '923002220005'
);

delete from vetting_checks
where phone in (
  '923001110001', '923001110002', '923001110003', '923001110004', '923001110005', '923001110006',
  '923002220001', '923002220002', '923002220003', '923002220004', '923002220005'
);

delete from matches
where freelancer_phone in ('923001110001', '923001110002', '923001110003', '923001110004', '923001110005', '923001110006')
or client_phone in ('923002220001', '923002220002', '923002220003', '923002220004', '923002220005');

delete from conversations
where phone in (
  '923001110001', '923001110002', '923001110003', '923001110004', '923001110005', '923001110006',
  '923002220001', '923002220002', '923002220003', '923002220004', '923002220005'
);

delete from freelancers
where phone in ('923001110001', '923001110002', '923001110003', '923001110004', '923001110005', '923001110006');

delete from job_requests
where phone in ('923002220001', '923002220002', '923002220003', '923002220004', '923002220005');

insert into freelancers (
  phone, name, profile_link, linkedin_url, github_url, cv_url, support_docs, portfolio,
  skills, tools, rate, availability, preferences, working_currently, contact_sharing_allowed,
  brief_description, trust_score, trust_tier, trust_breakdown, vetted_at, updated_at
) values
(
  '923001110001', 'Saba Khan', 'https://linkedin.com/in/saba-khan-dev', 'https://linkedin.com/in/saba-khan-dev',
  'https://github.com/sabakhan', 'https://example.com/cv/saba.pdf', 'https://example.com/certs/saba',
  'https://sabakhan.dev',
  'React, Next.js, Node.js, Shopify, landing pages, e-commerce websites',
  'React, Next.js, Tailwind, Supabase, Shopify, GitHub',
  '$22/hr', '30 hours/week', 'SaaS startups, e-commerce stores, US and MENA clients',
  true, true,
  'Full-stack web developer focused on fast storefronts, dashboards, landing pages, and product MVPs.',
  84, 'strong',
  '{"identity_links": 41, "skill_proof": 31, "claims_consistency": 12, "max": {"identity_links": 45, "skill_proof": 35, "claims_consistency": 20}, "broken_links": [], "unverifiable_links": []}'::jsonb,
  now(), now()
),
(
  '923001110002', 'Hamza Ali', 'https://linkedin.com/in/hamza-video', 'https://linkedin.com/in/hamza-video',
  null, 'https://example.com/cv/hamza.pdf', 'https://example.com/certs/hamza',
  'https://vimeo.com/hamzavideo',
  'Video editing, motion graphics, short-form ads, reels, YouTube editing',
  'Premiere Pro, After Effects, DaVinci Resolve, CapCut',
  '$18/hr', '25 hours/week', 'Short-form content, ad creatives, DTC brands',
  true, false,
  'Video editor for performance ads, reels, YouTube shorts, subtitles, hooks, and motion graphics.',
  68, 'verified',
  '{"identity_links": 30, "skill_proof": 26, "claims_consistency": 12, "max": {"identity_links": 45, "skill_proof": 35, "claims_consistency": 20}, "broken_links": [], "unverifiable_links": ["github_url"]}'::jsonb,
  now(), now()
),
(
  '923001110003', 'Ayesha Malik', 'https://linkedin.com/in/ayesha-design', 'https://linkedin.com/in/ayesha-design',
  null, 'https://example.com/cv/ayesha.pdf', 'https://example.com/case-studies/ayesha',
  'https://behance.net/ayeshamalik',
  'UI/UX design, graphic design, branding, logos, social media creatives',
  'Figma, Adobe Illustrator, Photoshop, Canva',
  '$20/hr', '35 hours/week', 'Brand identity, SaaS UI, social media packs',
  true, true,
  'Designer specializing in UI kits, app screens, landing page design, brand identity, and social content.',
  76, 'strong',
  '{"identity_links": 38, "skill_proof": 28, "claims_consistency": 10, "max": {"identity_links": 45, "skill_proof": 35, "claims_consistency": 20}, "broken_links": [], "unverifiable_links": []}'::jsonb,
  now(), now()
),
(
  '923001110004', 'Bilal Sheikh', 'https://linkedin.com/in/bilal-growth', 'https://linkedin.com/in/bilal-growth',
  null, null, 'https://example.com/certs/bilal',
  'https://bilalgrowth.example.com',
  'Social media management, Instagram growth, TikTok content, Meta ads, content calendars',
  'Meta Ads Manager, Canva, Notion, Buffer, Google Sheets',
  '$14/hr', '20 hours/week', 'Restaurants, fashion stores, founder-led brands',
  true, false,
  'Social media manager for content calendars, Instagram growth, reels, community management, and simple ad campaigns.',
  52, 'basic',
  '{"identity_links": 24, "skill_proof": 19, "claims_consistency": 9, "max": {"identity_links": 45, "skill_proof": 35, "claims_consistency": 20}, "broken_links": [], "unverifiable_links": ["cv_url"]}'::jsonb,
  now(), now()
),
(
  '923001110005', 'Junaid Raza', 'https://linkedin.com/in/junaid-data', 'https://linkedin.com/in/junaid-data',
  'https://github.com/junaiddata', 'https://example.com/cv/junaid.pdf', null,
  'https://junaiddata.example.com',
  'Data analytics, dashboards, SQL, Excel, Power BI, Python automation',
  'Power BI, SQL, Excel, Python, Tableau',
  '$24/hr', '28 hours/week', 'Analytics dashboards, business reporting, e-commerce metrics',
  true, true,
  'Data analyst building KPI dashboards, reporting systems, SQL models, and lightweight Python automations.',
  72, 'verified',
  '{"identity_links": 35, "skill_proof": 27, "claims_consistency": 10, "max": {"identity_links": 45, "skill_proof": 35, "claims_consistency": 20}, "broken_links": [], "unverifiable_links": []}'::jsonb,
  now(), now()
),
(
  '923001110006', 'Zain Qureshi', 'https://linkedin.com/in/zain-shopify', 'https://linkedin.com/in/zain-shopify',
  'https://github.com/zainshopify', null, null,
  'https://zainshopify.example.com',
  'Shopify development, WordPress, e-commerce, WooCommerce, landing pages',
  'Shopify, Liquid, WordPress, Elementor, WooCommerce',
  '$19/hr', '0 hours/week', 'E-commerce projects after next month',
  false, true,
  'Shopify and WordPress developer currently fully booked. Included to test working_currently=false gating.',
  61, 'verified',
  '{"identity_links": 29, "skill_proof": 23, "claims_consistency": 9, "max": {"identity_links": 45, "skill_proof": 35, "claims_consistency": 20}, "broken_links": [], "unverifiable_links": []}'::jsonb,
  now(), now()
)
on conflict (phone) do update set
  name = excluded.name,
  profile_link = excluded.profile_link,
  linkedin_url = excluded.linkedin_url,
  github_url = excluded.github_url,
  cv_url = excluded.cv_url,
  support_docs = excluded.support_docs,
  portfolio = excluded.portfolio,
  skills = excluded.skills,
  tools = excluded.tools,
  rate = excluded.rate,
  availability = excluded.availability,
  preferences = excluded.preferences,
  working_currently = excluded.working_currently,
  contact_sharing_allowed = excluded.contact_sharing_allowed,
  brief_description = excluded.brief_description,
  trust_score = excluded.trust_score,
  trust_tier = excluded.trust_tier,
  trust_breakdown = excluded.trust_breakdown,
  vetted_at = excluded.vetted_at,
  updated_at = excluded.updated_at;

insert into job_requests (
  phone, name, project_description, hire_type, budget_project, budget_hourly,
  project_count, deadline, deadline_normalized, is_recurring, hiring_currently,
  contact_sharing_allowed, brief_description, created_at
) values
(
  '923002220001', 'Zara Ahmed',
  'Need a React landing page and Shopify storefront refresh for a skincare brand. Must be mobile-first and fast.',
  'project-based', '$900', null, '1', '2 weeks', '2 weeks', false,
  true, false,
  'Looking for a web developer who can improve conversion, speed, and polish for an e-commerce launch.',
  now()
),
(
  '923002220002', 'Omar Siddiqui',
  'Need 20 short-form video ads for a fitness app, including hooks, subtitles, motion graphics, and export variations.',
  'project-based', '$650', null, '20', 'weekly', 'every week', true,
  true, true,
  'We need a video editor for ongoing performance creative tests across TikTok, Instagram, and YouTube Shorts.',
  now()
),
(
  '923002220003', 'Nida Farooq',
  'Need brand identity, logo cleanup, Instagram templates, and launch graphics for a boutique bakery.',
  'project-based', '$500', null, '1', '10 days', '10 days', false,
  true, false,
  'Brand design and social media creatives for a small business launch.',
  now()
),
(
  '923002220004', 'Farhan Iqbal',
  'Need a Power BI sales dashboard connected to exported Shopify and Google Sheets data with weekly reporting.',
  'project-based', '$800', null, '1', '3 weeks', '3 weeks', false,
  true, true,
  'Analytics dashboard for sales, inventory, CAC, repeat purchase rate, and weekly reporting.',
  now()
),
(
  '923002220005', 'Mehak Noor',
  'Planning a Shopify store build later this quarter, but not hiring yet.',
  'project-based', '$700', null, '1', 'next month', 'next month', false,
  false, false,
  'Included to test hiring_currently=false gating. This job should not produce matches until activated.',
  now()
)
on conflict (phone) do update set
  name = excluded.name,
  project_description = excluded.project_description,
  hire_type = excluded.hire_type,
  budget_project = excluded.budget_project,
  budget_hourly = excluded.budget_hourly,
  project_count = excluded.project_count,
  deadline = excluded.deadline,
  deadline_normalized = excluded.deadline_normalized,
  is_recurring = excluded.is_recurring,
  hiring_currently = excluded.hiring_currently,
  contact_sharing_allowed = excluded.contact_sharing_allowed,
  brief_description = excluded.brief_description,
  created_at = excluded.created_at;

insert into conversations (phone, step, role, temp_data, updated_at) values
('923001110001', 'completed', 'freelancer', jsonb_build_object('name', 'Saba Khan', 'linkedin_url', 'https://linkedin.com/in/saba-khan-dev', 'github_url', 'https://github.com/sabakhan', 'cv_url', 'https://example.com/cv/saba.pdf', 'support_docs', 'https://example.com/certs/saba', 'portfolio', 'https://sabakhan.dev', 'skills', 'React, Next.js, Node.js, Shopify, landing pages, e-commerce websites', 'tools', 'React, Next.js, Tailwind, Supabase, Shopify, GitHub', 'rate', '$22/hr', 'availability', '30 hours/week', 'preferences', 'SaaS startups, e-commerce stores, US and MENA clients', 'working_currently', true, 'contact_sharing_allowed', true, 'brief_description', 'Full-stack web developer focused on fast storefronts, dashboards, landing pages, and product MVPs.'), now()),
('923001110002', 'completed', 'freelancer', jsonb_build_object('name', 'Hamza Ali', 'linkedin_url', 'https://linkedin.com/in/hamza-video', 'cv_url', 'https://example.com/cv/hamza.pdf', 'support_docs', 'https://example.com/certs/hamza', 'portfolio', 'https://vimeo.com/hamzavideo', 'skills', 'Video editing, motion graphics, short-form ads, reels, YouTube editing', 'tools', 'Premiere Pro, After Effects, DaVinci Resolve, CapCut', 'rate', '$18/hr', 'availability', '25 hours/week', 'preferences', 'Short-form content, ad creatives, DTC brands', 'working_currently', true, 'contact_sharing_allowed', false, 'brief_description', 'Video editor for performance ads, reels, YouTube shorts, subtitles, hooks, and motion graphics.'), now()),
('923001110003', 'completed', 'freelancer', jsonb_build_object('name', 'Ayesha Malik', 'linkedin_url', 'https://linkedin.com/in/ayesha-design', 'cv_url', 'https://example.com/cv/ayesha.pdf', 'support_docs', 'https://example.com/case-studies/ayesha', 'portfolio', 'https://behance.net/ayeshamalik', 'skills', 'UI/UX design, graphic design, branding, logos, social media creatives', 'tools', 'Figma, Adobe Illustrator, Photoshop, Canva', 'rate', '$20/hr', 'availability', '35 hours/week', 'preferences', 'Brand identity, SaaS UI, social media packs', 'working_currently', true, 'contact_sharing_allowed', true, 'brief_description', 'Designer specializing in UI kits, app screens, landing page design, brand identity, and social content.'), now()),
('923001110004', 'completed', 'freelancer', jsonb_build_object('name', 'Bilal Sheikh', 'linkedin_url', 'https://linkedin.com/in/bilal-growth', 'support_docs', 'https://example.com/certs/bilal', 'portfolio', 'https://bilalgrowth.example.com', 'skills', 'Social media management, Instagram growth, TikTok content, Meta ads, content calendars', 'tools', 'Meta Ads Manager, Canva, Notion, Buffer, Google Sheets', 'rate', '$14/hr', 'availability', '20 hours/week', 'preferences', 'Restaurants, fashion stores, founder-led brands', 'working_currently', true, 'contact_sharing_allowed', false, 'brief_description', 'Social media manager for content calendars, Instagram growth, reels, community management, and simple ad campaigns.'), now()),
('923001110005', 'completed', 'freelancer', jsonb_build_object('name', 'Junaid Raza', 'linkedin_url', 'https://linkedin.com/in/junaid-data', 'github_url', 'https://github.com/junaiddata', 'cv_url', 'https://example.com/cv/junaid.pdf', 'portfolio', 'https://junaiddata.example.com', 'skills', 'Data analytics, dashboards, SQL, Excel, Power BI, Python automation', 'tools', 'Power BI, SQL, Excel, Python, Tableau', 'rate', '$24/hr', 'availability', '28 hours/week', 'preferences', 'Analytics dashboards, business reporting, e-commerce metrics', 'working_currently', true, 'contact_sharing_allowed', true, 'brief_description', 'Data analyst building KPI dashboards, reporting systems, SQL models, and lightweight Python automations.'), now()),
('923001110006', 'completed', 'freelancer', jsonb_build_object('name', 'Zain Qureshi', 'linkedin_url', 'https://linkedin.com/in/zain-shopify', 'github_url', 'https://github.com/zainshopify', 'portfolio', 'https://zainshopify.example.com', 'skills', 'Shopify development, WordPress, e-commerce, WooCommerce, landing pages', 'tools', 'Shopify, Liquid, WordPress, Elementor, WooCommerce', 'rate', '$19/hr', 'availability', '0 hours/week', 'preferences', 'E-commerce projects after next month', 'working_currently', false, 'contact_sharing_allowed', true, 'brief_description', 'Shopify and WordPress developer currently fully booked. Included to test working_currently=false gating.'), now()),
('923002220001', 'completed', 'client', jsonb_build_object('name', 'Zara Ahmed', 'project_description', 'Need a React landing page and Shopify storefront refresh for a skincare brand. Must be mobile-first and fast.', 'hire_type', 'project-based', 'budget_project', '$900', 'project_count', '1', 'deadline', '2 weeks', 'deadline_normalized', '2 weeks', 'is_recurring', false, 'hiring_currently', true, 'contact_sharing_allowed', false, 'brief_description', 'Looking for a web developer who can improve conversion, speed, and polish for an e-commerce launch.'), now()),
('923002220002', 'completed', 'client', jsonb_build_object('name', 'Omar Siddiqui', 'project_description', 'Need 20 short-form video ads for a fitness app, including hooks, subtitles, motion graphics, and export variations.', 'hire_type', 'project-based', 'budget_project', '$650', 'project_count', '20', 'deadline', 'weekly', 'deadline_normalized', 'every week', 'is_recurring', true, 'hiring_currently', true, 'contact_sharing_allowed', true, 'brief_description', 'We need a video editor for ongoing performance creative tests across TikTok, Instagram, and YouTube Shorts.'), now()),
('923002220003', 'completed', 'client', jsonb_build_object('name', 'Nida Farooq', 'project_description', 'Need brand identity, logo cleanup, Instagram templates, and launch graphics for a boutique bakery.', 'hire_type', 'project-based', 'budget_project', '$500', 'project_count', '1', 'deadline', '10 days', 'deadline_normalized', '10 days', 'is_recurring', false, 'hiring_currently', true, 'contact_sharing_allowed', false, 'brief_description', 'Brand design and social media creatives for a small business launch.'), now()),
('923002220004', 'completed', 'client', jsonb_build_object('name', 'Farhan Iqbal', 'project_description', 'Need a Power BI sales dashboard connected to exported Shopify and Google Sheets data with weekly reporting.', 'hire_type', 'project-based', 'budget_project', '$800', 'project_count', '1', 'deadline', '3 weeks', 'deadline_normalized', '3 weeks', 'is_recurring', false, 'hiring_currently', true, 'contact_sharing_allowed', true, 'brief_description', 'Analytics dashboard for sales, inventory, CAC, repeat purchase rate, and weekly reporting.'), now()),
('923002220005', 'completed', 'client', jsonb_build_object('name', 'Mehak Noor', 'project_description', 'Planning a Shopify store build later this quarter, but not hiring yet.', 'hire_type', 'project-based', 'budget_project', '$700', 'project_count', '1', 'deadline', 'next month', 'deadline_normalized', 'next month', 'is_recurring', false, 'hiring_currently', false, 'contact_sharing_allowed', false, 'brief_description', 'Included to test hiring_currently=false gating. This job should not produce matches until activated.'), now())
on conflict (phone) do update set
  step = excluded.step,
  role = excluded.role,
  temp_data = excluded.temp_data,
  updated_at = excluded.updated_at;

insert into matches (
  freelancer_phone, client_phone, status, freelancer_status, client_status,
  compatibility_score, trust_score, total_score,
  skills_overlap, budget_fit, availability_fit, ai_explanation, potential_risks, recommended_action,
  freelancer_responded_at, client_responded_at, hired_at, completed_at
) values
('923001110001', '923002220001', 'matched', 'interested', 'pending', 92, 84, 90, array['Web Development', 'React', 'Shopify'], true, true, 'Saba is a strong fit for the skincare launch because her React and Shopify experience matches the storefront and landing page requirements.', 'Scope includes both conversion work and speed, so agree milestones before starting.', 'Ask Saba for two recent storefront examples and confirm launch timeline.', now() - interval '2 hours', null, null, null),
('923001110003', '923002220001', 'shortlisted', 'pending', 'shortlisted', 61, 76, 65, array['UI/UX Design'], true, true, 'Ayesha can support the landing page design and visual polish even if development would need a separate handoff.', 'Development execution is not her core profile, so clarify whether this is design-only.', 'Use Ayesha for design direction or pair her with a developer.', null, now() - interval '1 hour', null, null),
('923001110002', '923002220002', 'matched', 'pending', 'pending', 90, 68, 85, array['Video Editing', 'Animation', 'UGC / Ad Creatives'], true, true, 'Hamza matches the short-form ad brief with editing, motion graphics, subtitles, and performance creative experience.', 'Contact sharing is private, so request approval before sharing phone details.', 'Ask Hamza for three ad samples with hook and retention results.', null, null, null, null),
('923001110004', '923002220002', 'declined', 'declined', 'pending', 65, 52, 62, array['Social Media', 'Digital Marketing'], true, true, 'Bilal is useful for distribution and content calendars around the video ad pipeline.', 'He is more social strategy than hands-on video editing.', 'Consider Bilal for campaign support, not primary editing.', now() - interval '3 hours', null, null, null),
('923001110003', '923002220003', 'mutual_interest', 'interested', 'shortlisted', 89, 76, 86, array['Graphic Design', 'UI/UX Design', 'Social Media'], true, true, 'Ayesha is a strong brand and design match for logo cleanup, templates, and launch graphics.', 'Budget looks workable, but confirm exact deliverable count.', 'Ask for a fixed package covering logo, templates, and source files.', now() - interval '45 minutes', now() - interval '50 minutes', null, null),
('923001110004', '923002220003', 'declined', 'pending', 'declined', 72, 52, 67, array['Social Media', 'Graphic Design'], true, true, 'Bilal can help turn the brand assets into a content calendar and simple social launch kit.', 'Design proof is lighter than social media proof.', 'Use Bilal for social rollout after the brand direction is set.', null, now() - interval '4 hours', null, null),
('923001110005', '923002220004', 'completed', 'completed', 'completed', 94, 72, 89, array['Data & Analytics'], true, true, 'Junaid is a strong analytics fit with Power BI, SQL, Excel, and dashboard reporting experience.', 'Confirm data source access and refresh cadence before starting.', 'Ask Junaid to outline dashboard pages and data fields before kickoff.', now() - interval '2 days', now() - interval '2 days', now() - interval '2 days', now() - interval '1 day')
on conflict (freelancer_phone, client_phone) do update set
  status = excluded.status,
  freelancer_status = excluded.freelancer_status,
  client_status = excluded.client_status,
  compatibility_score = excluded.compatibility_score,
  trust_score = excluded.trust_score,
  total_score = excluded.total_score,
  skills_overlap = excluded.skills_overlap,
  budget_fit = excluded.budget_fit,
  availability_fit = excluded.availability_fit,
  ai_explanation = excluded.ai_explanation,
  potential_risks = excluded.potential_risks,
  recommended_action = excluded.recommended_action,
  freelancer_responded_at = excluded.freelancer_responded_at,
  client_responded_at = excluded.client_responded_at,
  hired_at = excluded.hired_at,
  completed_at = excluded.completed_at,
  created_at = now();

insert into contact_requests (
  match_id, requester_phone, requester_role, target_phone, target_role, status, created_at
)
select id, '923002220002', 'client', '923001110002', 'freelancer', 'pending', now() - interval '30 minutes'
from matches
where freelancer_phone = '923001110002' and client_phone = '923002220002'
union all
select id, '923001110001', 'freelancer', '923002220001', 'client', 'pending', now() - interval '20 minutes'
from matches
where freelancer_phone = '923001110001' and client_phone = '923002220001';

insert into match_feedback (
  match_id, phone, role, useful, reason_key, reason_text, created_at, updated_at
)
select id, '923001110004', 'freelancer', false, 'skills', 'More social strategy than hands-on video editing.', now() - interval '3 hours', now() - interval '3 hours'
from matches
where freelancer_phone = '923001110004' and client_phone = '923002220002'
union all
select id, '923002220003', 'client', false, 'trust', 'Design proof looked lighter than the top option.', now() - interval '4 hours', now() - interval '4 hours'
from matches
where freelancer_phone = '923001110004' and client_phone = '923002220003'
union all
select id, '923002220003', 'client', true, null, null, now() - interval '45 minutes', now() - interval '45 minutes'
from matches
where freelancer_phone = '923001110003' and client_phone = '923002220003'
union all
select id, '923002220004', 'client', true, null, null, now() - interval '1 day', now() - interval '1 day'
from matches
where freelancer_phone = '923001110005' and client_phone = '923002220004';

insert into notifications (phone, type, title, body)
values
('923002220001', 'new_match', '2 freelancer matches found', 'Top match: Saba Khan (90% overall).'),
('923002220002', 'new_match', '2 freelancer matches found', 'Top match: Hamza Ali (85% overall).'),
('923002220003', 'new_match', '2 freelancer matches found', 'Top match: Ayesha Malik (86% overall).'),
('923002220004', 'new_match', '1 freelancer match found', 'Top match: Junaid Raza (89% overall).'),
('923001110001', 'new_match', 'New project matches your skills', 'Zara Ahmed needs a React and Shopify storefront refresh.'),
('923001110002', 'new_match', 'New project matches your skills', 'Omar Siddiqui needs short-form video ads.'),
('923001110003', 'new_match', 'New projects match your profile', 'You match Zara Ahmed and Nida Farooq.'),
('923001110004', 'new_match', 'New projects match your profile', 'You match Omar Siddiqui and Nida Farooq.'),
('923001110005', 'new_match', 'New project matches your skills', 'Farhan Iqbal needs a Power BI sales dashboard.'),
('923002220001', 'match_status', 'Pending freelancer interest', 'Saba Khan marked interest. Reply show pending to review incoming requests.'),
('923001110003', 'match_status', 'Mutual interest confirmed', 'Nida Farooq shortlisted you and you marked interest.'),
('923002220004', 'match_status', 'Project marked completed', 'Junaid Raza completed the Power BI dashboard sample match.'),
('923001110002', 'match_status', 'Contact approval pending', 'Omar Siddiqui requested your WhatsApp contact for the video ads match.');

insert into insights (phone, insight_type, content, metric_value, metric_label, icon, color)
values
('923001110001', 'profile_strength', 'Sample profile is 100% complete and ready for matching.', 100, 'Profile completeness (%)', 'star', 'violet'),
('923001110001', 'market_demand', '1 active sample project mentions skills Saba has.', 1, 'Open matching projects', 'target', 'emerald'),
('923001110002', 'profile_strength', 'Sample profile is strong but contact sharing is private.', 88, 'Profile completeness (%)', 'star', 'violet'),
('923001110002', 'market_demand', '1 active sample project is a video editing fit.', 1, 'Open matching projects', 'target', 'emerald'),
('923001110003', 'profile_strength', 'Sample design profile is complete and contact sharing is enabled.', 95, 'Profile completeness (%)', 'star', 'violet'),
('923001110004', 'profile_strength', 'Sample social media profile is active with private contact sharing.', 82, 'Profile completeness (%)', 'star', 'violet'),
('923001110005', 'profile_strength', 'Sample analytics profile is active and ready for dashboard work.', 91, 'Profile completeness (%)', 'star', 'violet'),
('923001110006', 'market_demand', 'This freelancer is marked not open to work, so no matches should be generated.', 0, 'Open matching projects', 'target', 'amber');

select 'Sample clients, freelancers, lifecycle matches, contact requests, feedback, notifications, and insights inserted.' as status;

select
  (select count(*) from freelancers where phone like '923001110%') as sample_freelancers,
  (select count(*) from job_requests where phone like '923002220%') as sample_clients,
  (select count(*) from matches where freelancer_phone like '923001110%' or client_phone like '923002220%') as sample_matches,
  (select count(*) from contact_requests where requester_phone like '923001110%' or requester_phone like '923002220%' or target_phone like '923001110%' or target_phone like '923002220%') as sample_contact_requests,
  (select count(*) from match_feedback where phone like '923001110%' or phone like '923002220%') as sample_feedback_rows;

-- 20260425_rewards_catalogue_expansion.sql
-- Broadens the lootbox_rewards catalogue with more creative drops across all
-- six reward types. Banners, frames, stickers, animated stickers, badges and
-- coin bundles remain first-class — some visual integrations (banner on
-- public profiles, stickers inside posts/comments, animated GIFs in event
-- experiences) are staged in the schema now so future UI work can reuse the
-- existing inventory + is_equipped plumbing.

begin;

insert into lootbox_rewards (type, name, description, asset_url, rarity, coin_value) values
  -- Extra profile frames (common→legendary)
  ('profile_frame',     'Holz-Rahmen',             'Holz-Look-Rahmen für dein Profilbild',
   'https://placehold.co/256x256/8B5E3C/ffd23f?text=FRAME6', 'common', null),
  ('profile_frame',     'Röbeler See Rahmen',      'Welliger Seeufer-Rahmen',
   'https://placehold.co/256x256/1a5c3a/ffd23f?text=FRAME7', 'rare', null),
  ('profile_frame',     'Feuerwerk Rahmen',        'Festlicher Feuerwerk-Rahmen',
   'https://placehold.co/256x256/ff3366/ffd23f?text=FRAME8', 'rare', null),
  ('profile_frame',     'Sternenstaub Rahmen',     'Legendärer Sternenstaub-Rahmen',
   'https://placehold.co/256x256/6b3fa0/ffffff?text=FRAME9', 'legendary', null),

  -- Extra profile banners (for future public-profile / feed surfaces)
  ('profile_banner',    'Hafen-Banner',            'Röbel Hafen im Sonnenuntergang',
   'https://placehold.co/1024x256/f97316/ffffff?text=BANNER3','rare',  null),
  ('profile_banner',    'Mecky Parade',            'Mecky mit seinen Freunden auf der Parade',
   'https://placehold.co/1024x256/6b3fa0/ffd23f?text=BANNER4','epic',  null),
  ('profile_banner',    'Müritz-Sonnenaufgang',    'Sanfter Sonnenaufgang über dem See',
   'https://placehold.co/1024x256/ffd23f/194383?text=BANNER5','legendary', null),

  -- Extra stickers — expressive Mecky moods (for future posts/comments picker)
  ('sticker',           'Mecky Hallo',             'Mecky winkt zur Begrüßung',
   'https://placehold.co/256x256/ffd23f/194383?text=STK6',  'common', null),
  ('sticker',           'Mecky Müde',              'Schlafender Mecky-Sticker',
   'https://placehold.co/256x256/6b7280/ffffff?text=STK7',  'common', null),
  ('sticker',           'Mecky Pfote hoch',        'Pfote-hoch-Sticker',
   'https://placehold.co/256x256/16a34a/ffffff?text=STK8',  'rare',   null),
  ('sticker',           'Mecky LOL',               'Lachender Mecky-Sticker',
   'https://placehold.co/256x256/F59E0B/194383?text=STK9',  'rare',   null),
  ('sticker',           'Mecky Denker',            'Nachdenklicher Mecky',
   'https://placehold.co/256x256/194383/ffd23f?text=STK10', 'epic',   null),

  -- Extra animated stickers — for future GIF picker inside event experiences
  ('animated_sticker',  'Mecky Winken',            'Animierter winkender Mecky',
   'https://placehold.co/256x256/1a5c3a/ffd23f?text=ANI3',  'epic',      null),
  ('animated_sticker',  'Mecky Feuerwerk',         'Mecky mit Feuerwerk über dem Kopf',
   'https://placehold.co/256x256/ff3366/ffffff?text=ANI4',  'epic',      null),
  ('animated_sticker',  'Mecky Regenbogen',        'Seltener Regenbogen-Mecky',
   'https://placehold.co/256x256/6b3fa0/ffd23f?text=ANI5',  'legendary', null),

  -- Badges (small cosmetic pill on the identity card & future public profiles)
  ('badge',             'Kulturbotschafter',       'Für aktive Event-Teilnahme',
   'https://placehold.co/128x128/194383/ffd23f?text=BADGE1','rare',      null),
  ('badge',             'Müritz-Legende',          'Verliehen an die Ersten der Gemeinde',
   'https://placehold.co/128x128/F59E0B/194383?text=BADGE2','epic',      null),
  ('badge',             'Röbel-Gründer',           'Eine ganz seltene Auszeichnung',
   'https://placehold.co/128x128/ff3366/ffd23f?text=BADGE3','legendary', null),
  ('badge',             'Freundlicher Geist',      'Für wer anderen hilft',
   'https://placehold.co/128x128/1a5c3a/ffffff?text=BADGE4','common',    null),
  ('badge',             'Event-Hopper',            'Fünf Events besucht',
   'https://placehold.co/128x128/6b3fa0/ffffff?text=BADGE5','rare',      null),

  -- Coin bundles (surprise coin drops)
  ('coin_bundle',       'Münzen-Bonus (+50)',      'Kleiner Münzbonus',
   'https://placehold.co/256x256/ffd23f/194383?text=%2B50', 'common',     50),
  ('coin_bundle',       'Münzen-Bonus (+250)',     'Großer Münzbonus',
   'https://placehold.co/256x256/ffd23f/ff3366?text=%2B250','epic',      250),
  ('coin_bundle',       'Münzen-Jackpot (+500)',   'Der seltene Jackpot',
   'https://placehold.co/256x256/F59E0B/194383?text=%2B500','legendary', 500);

-- Wire all new rewards into every existing lootbox with rarity-based weights
-- (common=50, rare=20, epic=8, legendary=2). Existing pool rows are left
-- untouched via ON CONFLICT DO NOTHING.
insert into lootbox_reward_pool (lootbox_id, reward_id, weight)
select lb.id,
       r.id,
       case r.rarity
         when 'common'    then 50
         when 'rare'      then 20
         when 'epic'      then 8
         when 'legendary' then 2
       end
from lootboxes lb
cross join lootbox_rewards r
on conflict (lootbox_id, reward_id) do nothing;

commit;

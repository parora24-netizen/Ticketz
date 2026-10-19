-- CI tokens can be revealed again by the lead on Admin: kept encrypted (AES-GCM, key derived from
-- the server's secret key) next to the hash the API checks. Older tokens have only the hash.
alter table ci_tokens add column token_enc text;

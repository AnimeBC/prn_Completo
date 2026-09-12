-- ============================================================
-- PIKANTE PE - SOLO DATOS (videos + fetiches)
-- ============================================================
-- Inserta unicamente las filas de: fetiche_categorias, tags, videos, video_tags.
-- NO crea tablas ni base de datos (usa tablas.sql para el esquema).
--
-- Importar en el VPS (con las tablas ya creadas):
--   psql -U postgres -d pikantepe -f pikantepe_vps.sql
--   docker exec -i pg psql -U postgres -d pikantepe < pikantepe_vps.sql
--
-- Idempotente: usa ON CONFLICT DO NOTHING (no duplica).
-- Los archivos reales van en media_completa/ (no aqui).
-- ============================================================
INSERT INTO public.fetiche_categorias (id, nombre, slug, activo, created_at) VALUES (2, 'Orgía', 'orgia', true, '2026-09-12 02:57:42.573911') ON CONFLICT DO NOTHING;
INSERT INTO public.fetiche_categorias (id, nombre, slug, activo, created_at) VALUES (7, 'Obligada', 'obligada', true, '2026-09-12 02:57:42.573911') ON CONFLICT DO NOTHING;
INSERT INTO public.fetiche_categorias (id, nombre, slug, activo, created_at) VALUES (1, 'Japonesa', 'japonesa', true, '2026-09-12 02:57:42.573911') ON CONFLICT DO NOTHING;
INSERT INTO public.fetiche_categorias (id, nombre, slug, activo, created_at) VALUES (3, 'Viral', 'viral', true, '2026-09-12 02:57:42.573911') ON CONFLICT DO NOTHING;
INSERT INTO public.fetiche_categorias (id, nombre, slug, activo, created_at) VALUES (4, 'Pedido', 'pedido', true, '2026-09-12 02:57:42.573911') ON CONFLICT DO NOTHING;
INSERT INTO public.fetiche_categorias (id, nombre, slug, activo, created_at) VALUES (5, 'Latex', 'latex', true, '2026-09-12 02:57:42.573911') ON CONFLICT DO NOTHING;
INSERT INTO public.fetiche_categorias (id, nombre, slug, activo, created_at) VALUES (6, 'En carro', 'en-carro', true, '2026-09-12 02:57:42.573911') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (2, '4K', '4k') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (9, 'Anal', 'anal') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (10, 'Trío', 'trio') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (11, 'Amateur', 'amateur') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (12, 'Latina', 'latina') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (13, 'MILF', 'milf') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (3, 'JAV', 'jav') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (17, 'Orgía', 'org-a') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (6, 'Viral', 'viral') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (24, 'Pedido', 'pedido') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (27, 'Latex', 'latex') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (4, 'Tendencia', 'tendencia') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (38, 'En carro', 'en-carro') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (54, 'NTR?', 'ntr') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (53, 'Obligada', 'obligada') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (14, 'Gritona', 'gritona') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (37, 'Insaciable', 'insaciable') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (46, 'Argentina', 'argentina') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (41, 'Borracha', 'borracha') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (15, 'Fetiche', 'fetiche') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (1, 'HD', 'hd') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (7, 'Oral', 'oral') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (47, 'trío', 'tr-o') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (8, 'Vaginal', 'vaginal') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (51, 'Dildo', 'dildo') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (5, 'Japonesa', 'japonesa') ON CONFLICT DO NOTHING;
INSERT INTO public.tags (id, nombre, slug) VALUES (52, 'Masturbacion', 'masturbacion') ON CONFLICT DO NOTHING;
INSERT INTO public.videos (id, slug, titulo_es, titulo_en, desc_es, desc_en, canal, src, thumb, descarga, duracion, vistas, likes, dislikes, is_fetiche, fetiche_categoria_id, is_tendencia, activo, publicado_en, created_at, updated_at, renditions) VALUES (8, NULL, 'Trio con masoquista', 'Threesome with a masochist', 'Un trío intenso con una masoquista que pide más.', 'An intense threesome with a masochist who begs for more.', 'administrador pikante.pe', '/media/videos/video_008/calidades/720p.mp4', '/media/videos/video_008/thumbs/cover.png', '/media/videos/video_008/calidades/720p.mp4', '00:39', 5102, 0, 0, false, NULL, false, true, '2026-09-12 02:59:56.381022', '2026-09-12 02:59:56.381022', '2026-09-12 04:04:11.941377', '[{"src": "/media/videos/video_008/calidades/720p.mp4", "label": "720p", "height": 720}, {"src": "/media/videos/video_008/calidades/480p.mp4", "label": "480p", "height": 480}, {"src": "/media/videos/video_008/calidades/360p.mp4", "label": "360p", "height": 360}]') ON CONFLICT DO NOTHING;
INSERT INTO public.videos (id, slug, titulo_es, titulo_en, desc_es, desc_en, canal, src, thumb, descarga, duracion, vistas, likes, dislikes, is_fetiche, fetiche_categoria_id, is_tendencia, activo, publicado_en, created_at, updated_at, renditions) VALUES (9, NULL, 'Japonesa con DILDOO', 'Japanese girl with a DILDO', 'Japonesa con su juguete favorito, cortito pero intenso.', 'Japanese girl with her favorite toy, short but intense.', 'administrador pikante.pe', '/media/videos/video_009/calidades/480p.mp4', '/media/videos/video_009/thumbs/cover.png', '/media/videos/video_009/calidades/480p.mp4', '00:18', 7304, 0, 0, false, NULL, false, true, '2026-09-12 02:59:56.381022', '2026-09-12 02:59:56.381022', '2026-09-12 04:12:32.544087', '[{"src": "/media/videos/video_009/calidades/480p.mp4", "label": "480p", "height": 480}, {"src": "/media/videos/video_009/calidades/360p.mp4", "label": "360p", "height": 360}]') ON CONFLICT DO NOTHING;
INSERT INTO public.videos (id, slug, titulo_es, titulo_en, desc_es, desc_en, canal, src, thumb, descarga, duracion, vistas, likes, dislikes, is_fetiche, fetiche_categoria_id, is_tendencia, activo, publicado_en, created_at, updated_at, renditions) VALUES (5, NULL, 'Sedienta de PENE XD (lit)', 'Thirsty for DICK XD (lit)', 'Literalmente sedienta, sin filtro y sin censura.', 'Literally thirsty, no filter, no censorship.', 'administrador pikante.pe', '/media/videos/video_005/calidades/720p.mp4', '/media/videos/video_005/thumbs/cover.png', '/media/videos/video_005/calidades/720p.mp4', '05:56', 5106, 0, 0, false, NULL, false, true, '2026-09-12 02:59:56.381022', '2026-09-12 02:59:56.381022', '2026-09-12 04:04:31.755135', '[{"src": "/media/videos/video_005/calidades/720p.mp4", "label": "720p", "height": 720}, {"src": "/media/videos/video_005/calidades/480p.mp4", "label": "480p", "height": 480}, {"src": "/media/videos/video_005/calidades/360p.mp4", "label": "360p", "height": 360}]') ON CONFLICT DO NOTHING;
INSERT INTO public.videos (id, slug, titulo_es, titulo_en, desc_es, desc_en, canal, src, thumb, descarga, duracion, vistas, likes, dislikes, is_fetiche, fetiche_categoria_id, is_tendencia, activo, publicado_en, created_at, updated_at, renditions) VALUES (4, NULL, 'Nena gritona en latex', 'Screaming girl in latex', 'Body de látex, gritos y una noche que se sale de control.', 'Latex bodysuit, screaming and a night that gets out of control.', 'administrador pikante.pe', '/media/fetiches/fetiche_04/calidades/480p.mp4', '/media/fetiches/fetiche_04/thumbs/cover.png', '/media/fetiches/fetiche_04/calidades/480p.mp4', '08:36', 4300, 0, 0, true, 5, true, true, '2026-09-12 02:59:56.381022', '2026-09-12 02:59:56.381022', '2026-09-12 03:50:53.635105', '[{"src": "/media/fetiches/fetiche_04/calidades/480p.mp4", "label": "480p", "height": 480}, {"src": "/media/fetiches/fetiche_04/calidades/360p.mp4", "label": "360p", "height": 360}]') ON CONFLICT DO NOTHING;
INSERT INTO public.videos (id, slug, titulo_es, titulo_en, desc_es, desc_en, canal, src, thumb, descarga, duracion, vistas, likes, dislikes, is_fetiche, fetiche_categoria_id, is_tendencia, activo, publicado_en, created_at, updated_at, renditions) VALUES (3, NULL, 'Zully - Pedido en la Bbaarmy', 'Zully - Requested by the Bbaarmy', 'El video de Zully que pidió la Bbaarmy, recién salido del horno.', 'Zully''s video requested by the Bbaarmy, fresh out of the oven.', 'administrador pikante.pe', '/media/fetiches/fetiche_03/calidades/720p.mp4', '/media/fetiches/fetiche_03/thumbs/cover.png', '/media/fetiches/fetiche_03/calidades/720p.mp4', '01:02', 5340, 0, 0, true, 4, true, true, '2026-09-12 02:59:56.381022', '2026-09-12 02:59:56.381022', '2026-09-12 03:47:04.480423', '[{"src": "/media/fetiches/fetiche_03/calidades/1080p.mp4", "label": "1080p", "height": 1080}, {"src": "/media/fetiches/fetiche_03/calidades/720p.mp4", "label": "720p", "height": 720}, {"src": "/media/fetiches/fetiche_03/calidades/480p.mp4", "label": "480p", "height": 480}, {"src": "/media/fetiches/fetiche_03/calidades/360p.mp4", "label": "360p", "height": 360}]') ON CONFLICT DO NOTHING;
INSERT INTO public.videos (id, slug, titulo_es, titulo_en, desc_es, desc_en, canal, src, thumb, descarga, duracion, vistas, likes, dislikes, is_fetiche, fetiche_categoria_id, is_tendencia, activo, publicado_en, created_at, updated_at, renditions) VALUES (1, NULL, 'Familia Japonesa Película Porno', 'Japanese Family Porn Movie', 'La mejor recomendación de la casa: una película japonesa en familia que es tendencia en la comunidad.', 'The house''s top recommendation: a Japanese family movie trending in the community.', 'administrador pikante.pe', '/media/fetiches/fetiche_01/original.mp4', '/media/fetiches/fetiche_01/thumbs/cover.png', '/media/fetiches/fetiche_01/original.mp4', '2:32:50', 12482, 0, 0, true, 1, true, true, '2026-09-12 02:59:56.381022', '2026-09-12 02:59:56.381022', '2026-09-12 04:04:18.526345', '[]') ON CONFLICT DO NOTHING;
INSERT INTO public.videos (id, slug, titulo_es, titulo_en, desc_es, desc_en, canal, src, thumb, descarga, duracion, vistas, likes, dislikes, is_fetiche, fetiche_categoria_id, is_tendencia, activo, publicado_en, created_at, updated_at, renditions) VALUES (7, NULL, 'Borracha Vengandose 😈', 'Drunk Girl Getting Revenge 😈', 'Borracha y con ganas de vengarse, no se lo esperaba nadie.', 'Drunk and out for revenge, nobody saw it coming.', 'administrador pikante.pe', '/media/videos/video_007/calidades/720p.mp4', '/media/videos/video_007/thumbs/cover.png', '/media/videos/video_007/calidades/720p.mp4', '00:54', 1704, 0, 0, false, NULL, false, true, '2026-09-12 02:59:56.381022', '2026-09-12 02:59:56.381022', '2026-09-12 04:04:13.874623', '[{"src": "/media/videos/video_007/calidades/720p.mp4", "label": "720p", "height": 720}, {"src": "/media/videos/video_007/calidades/480p.mp4", "label": "480p", "height": 480}, {"src": "/media/videos/video_007/calidades/360p.mp4", "label": "360p", "height": 360}]') ON CONFLICT DO NOTHING;
INSERT INTO public.videos (id, slug, titulo_es, titulo_en, desc_es, desc_en, canal, src, thumb, descarga, duracion, vistas, likes, dislikes, is_fetiche, fetiche_categoria_id, is_tendencia, activo, publicado_en, created_at, updated_at, renditions) VALUES (6, NULL, 'En el carro, rico', 'In the car, so good', 'Rapidito en el carro, con adrenalina de que alguien pase.', 'A quickie in the car, with the thrill of someone walking by.', 'administrador pikante.pe', '/media/fetiches/fetiche_06/calidades/720p.mp4', '/media/fetiches/fetiche_06/thumbs/cover.png', '/media/fetiches/fetiche_06/calidades/720p.mp4', '02:50', 5402, 0, 0, true, 6, false, true, '2026-09-12 02:59:56.381022', '2026-09-12 02:59:56.381022', '2026-09-12 04:04:16.663693', '[{"src": "/media/fetiches/fetiche_06/calidades/720p.mp4", "label": "720p", "height": 720}, {"src": "/media/fetiches/fetiche_06/calidades/480p.mp4", "label": "480p", "height": 480}, {"src": "/media/fetiches/fetiche_06/calidades/360p.mp4", "label": "360p", "height": 360}]') ON CONFLICT DO NOTHING;
INSERT INTO public.videos (id, slug, titulo_es, titulo_en, desc_es, desc_en, canal, src, thumb, descarga, duracion, vistas, likes, dislikes, is_fetiche, fetiche_categoria_id, is_tendencia, activo, publicado_en, created_at, updated_at, renditions) VALUES (2, NULL, 'Kchame Viral', 'Kchame Viral', 'El video de Kchame que está rompiendo el internet, viral en todos lados.', 'Kchame''s video that''s breaking the internet, viral everywhere.', 'administrador pikante.pe', '/media/fetiches/fetiche_02/calidades/720p.mp4', '/media/fetiches/fetiche_02/thumbs/cover.png', '/media/fetiches/fetiche_02/calidades/720p.mp4', '02:31', 8120, 0, 0, true, 3, true, true, '2026-09-12 02:59:56.381022', '2026-09-12 02:59:56.381022', '2026-09-12 03:48:03.760229', '[{"src": "/media/fetiches/fetiche_02/calidades/1080p.mp4", "label": "1080p", "height": 1080}, {"src": "/media/fetiches/fetiche_02/calidades/720p.mp4", "label": "720p", "height": 720}, {"src": "/media/fetiches/fetiche_02/calidades/480p.mp4", "label": "480p", "height": 480}, {"src": "/media/fetiches/fetiche_02/calidades/360p.mp4", "label": "360p", "height": 360}]') ON CONFLICT DO NOTHING;
INSERT INTO public.videos (id, slug, titulo_es, titulo_en, desc_es, desc_en, canal, src, thumb, descarga, duracion, vistas, likes, dislikes, is_fetiche, fetiche_categoria_id, is_tendencia, activo, publicado_en, created_at, updated_at, renditions) VALUES (10, NULL, 'Obligada :(', 'Forced :(', 'Una chica obligada mientras su marido mira. No sé si sentir pena o no, pero F :(', 'A girl forced while her husband watches. Not sure whether to feel sorry or not, but F :(', 'administrador pikante.pe', '/media/fetiches/fetiche_10/calidades/720p.mp4', '/media/fetiches/fetiche_10/thumbs/cover.png', '/media/fetiches/fetiche_10/calidades/720p.mp4', '00:41', 4626, 0, 0, true, 7, true, true, '2026-09-12 02:59:56.381022', '2026-09-12 02:59:56.381022', '2026-09-12 04:08:08.020102', '[{"src": "/media/fetiches/fetiche_10/calidades/720p.mp4", "label": "720p", "height": 720}, {"src": "/media/fetiches/fetiche_10/calidades/480p.mp4", "label": "480p", "height": 480}, {"src": "/media/fetiches/fetiche_10/calidades/360p.mp4", "label": "360p", "height": 360}]') ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (10, 15) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (10, 54) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (10, 53) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (10, 4) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (10, 8) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (1, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (1, 5) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (1, 3) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (1, 17) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (1, 4) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (2, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (2, 4) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (2, 6) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (3, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (3, 24) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (3, 4) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (4, 15) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (4, 14) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (4, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (4, 27) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (4, 4) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (4, 8) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (6, 38) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (6, 15) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (6, 8) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (5, 14) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (5, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (5, 37) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (5, 7) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (5, 8) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (7, 46) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (7, 41) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (7, 15) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (7, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (7, 7) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (7, 8) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (8, 7) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (8, 47) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (8, 8) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (9, 51) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (9, 5) ON CONFLICT DO NOTHING;
INSERT INTO public.video_tags (video_id, tag_id) VALUES (9, 52) ON CONFLICT DO NOTHING;
SELECT pg_catalog.setval('public.fetiche_categorias_id_seq', 22, true);
SELECT pg_catalog.setval('public.tags_id_seq', 171, true);
SELECT pg_catalog.setval('public.videos_id_seq', 10, true);

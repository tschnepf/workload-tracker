--
-- PostgreSQL database dump
--

\restrict HMm8aIW0cCVI5LZfBIhJDbD9kluvikSuoEtborVkwfJ1EBBzCWYymdv4adyyezR

-- Dumped from database version 17.6 (Debian 17.6-2.pgdg13+1)
-- Dumped by pg_dump version 17.7 (Debian 17.7-0+deb13u1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: projects_project; Type: TABLE DATA; Schema: public; Owner: workload_user
--

COPY public.projects_project (id, name, status, client, description, start_date, end_date, estimated_hours, project_number, is_active, created_at, updated_at, notes, notes_json, bqe_client_id, bqe_client_name, client_sync_policy_state) FROM stdin;
19	Q1908-DLR R108	completed	Align Comm.	CFD/SKM	\N	\N	\N	25.002	t	2025-08-29 22:58:53.84451+00	2025-08-30 00:08:56.409761+00		\N	\N	\N	preserve_local
21	GAZ2	completed	Align Comm.	TFO	\N	\N	\N	25.048.01	t	2025-08-29 22:58:53.88937+00	2025-08-30 00:11:10.153235+00		\N	\N	\N	preserve_local
20	IAD44 - S105/S205	completed	Align Comm.	CFD	\N	\N	\N	25.008	t	2025-08-29 22:58:53.872421+00	2025-08-30 00:11:22.160702+00		\N	\N	\N	preserve_local
31	Chandler Campus Energy Study	completed	CyrusOne	Report	\N	\N	\N	25.054	t	2025-08-29 22:58:54.076527+00	2025-08-30 00:15:57.538097+00		\N	\N	\N	preserve_local
30	Chandler PHX7 & 8 PDU Cooling	completed	CyrusOne	Renovation	\N	\N	\N	25.055.01	t	2025-08-29 22:58:54.062186+00	2025-08-30 00:16:00.247889+00		\N	\N	\N	preserve_local
27	CHI06A (old CHI8)	on_hold	CyrusOne	Greenfield	\N	\N	\N	25.022	t	2025-08-29 22:58:54.005802+00	2025-08-30 00:16:54.181171+00		\N	\N	\N	preserve_local
26	BHE Canada Mechanical Cooling Solution	completed	BHE	Assessment	\N	\N	\N	25.041	t	2025-08-29 22:58:53.988641+00	2025-08-30 19:16:22.947547+00		\N	\N	\N	preserve_local
46	DFW02B	active	Stack	Greenfield	\N	\N	\N	25.052	t	2025-08-29 22:58:54.393686+00	2025-08-29 23:16:46.325777+00		\N	\N	\N	preserve_local
57	CHI10	on_hold	CyrusOne	Greenfield	\N	\N	\N	24.026	t	2025-08-29 22:58:54.601569+00	2025-08-29 23:16:46.845132+00		\N	\N	\N	preserve_local
37	Las Vegas	active	Prologis	Assessment	\N	\N	\N	25.XXX	t	2025-08-29 22:58:54.213422+00	2025-08-29 23:16:47.205812+00		\N	\N	\N	preserve_local
68	Project ORD2 Peer Review in facility ORD11 Suite 400	completed	Align Comm.	--	\N	\N	\N	24.067	t	2025-08-29 22:58:54.834725+00	2025-08-30 00:08:52.095756+00		\N	\N	\N	preserve_local
70	ADC - PHX07	completed	Switch Electric	VDC	\N	\N	\N	24.004	t	2025-08-29 22:58:54.869997+00	2025-08-31 21:49:55.540756+00		\N	\N	\N	preserve_local
61	DFW01C - Greenfield	on_hold	Stack	Greenfield	\N	\N	\N	25.006	t	2025-08-29 22:58:54.685882+00	2025-09-03 12:45:38.717266+00		\N	\N	\N	preserve_local
41	Project Steel	on_hold	Prologis	Assessment	\N	\N	\N	25.013	t	2025-08-29 22:58:54.290153+00	2025-09-02 02:31:30.570678+00		\N	\N	\N	preserve_local
59	Corgan – IMDC – CHI1 B3 Upfit	on_hold	Iron Mountain	Renovation	\N	\N	\N	24.044	t	2025-08-29 22:58:54.644258+00	2025-09-08 02:20:45.381234+00		\N	\N	\N	preserve_local
28	DFW17A	active_ca	CyrusOne	Greenfield	\N	\N	\N	25.035	t	2025-08-29 22:58:54.025972+00	2025-12-29 18:06:24.530118+00		\N	\N	\N	preserve_local
54	Stack - Temp Power	cancelled	Clayco	Temp Power	\N	\N	\N	25.015	t	2025-08-29 22:58:54.540511+00	2025-10-14 16:17:31.55703+00		\N	\N	\N	preserve_local
48	Michigan - 14MW Network Bldg	active	Related	Greenfield	\N	\N	\N	25.067	t	2025-08-29 22:58:54.427634+00	2026-01-16 16:08:30.052747+00		\N	\N	\N	preserve_local
51	PHX3 DH50 PDU Adder	completed	CyrusOne	Renovation	\N	\N	\N	24.020	t	2025-08-29 22:58:54.484835+00	2025-10-14 16:13:26.063114+00		\N	\N	\N	preserve_local
67	PHX3 Vega 2.0	completed	Align Comm.	--	\N	\N	\N	24.079	t	2025-08-29 22:58:54.814512+00	2025-11-14 12:59:04.641771+00		\N	\N	\N	preserve_local
25	ELN02 TFO	active_ca	Applied Digital	Tenant Fit Out	\N	\N	\N	24.032	t	2025-08-29 22:58:53.971294+00	2026-01-16 15:31:39.505427+00		\N	\N	\N	preserve_local
55	1GServers Due Diligence	active_ca	BGA	Assessment	\N	\N	\N	25.028.01	t	2025-08-29 22:58:54.560093+00	2025-10-14 16:17:51.258573+00		\N	\N	\N	preserve_local
29	CHI11	active	CyrusOne	Greenfield	\N	\N	\N	25.053	t	2025-08-29 22:58:54.044151+00	2026-01-20 18:37:53.730573+00		\N	\N	\N	preserve_local
22	CMH03	active	ADC	Greenfield	2025-08-15	\N	\N	25.005.1	t	2025-08-29 22:58:53.908255+00	2026-01-12 19:19:55.369854+00		\N	\N	\N	preserve_local
94	Miner Bld A	active	Stack		\N	\N	\N	25.082	t	2025-10-20 16:03:15.240759+00	2025-11-03 20:43:03.829832+00		\N	\N	\N	preserve_local
42	Remington Bldg 1	on_hold	PointOne	Greenfield	\N	\N	\N	24.056	t	2025-08-29 22:58:54.313958+00	2025-10-17 19:46:38.914121+00		\N	\N	\N	preserve_local
39	Megawatt - Plano TX	active_ca	Megawatt	Renovation	\N	\N	\N	25.021	t	2025-08-29 22:58:54.249636+00	2025-11-25 17:36:17.534859+00		\N	\N	\N	preserve_local
43	Remington Bldg 2 & 3	on_hold	PointOne	Greenfield	\N	\N	\N	24.056.5	t	2025-08-29 22:58:54.336452+00	2025-10-17 19:48:03.406792+00		\N	\N	\N	preserve_local
24	CMH02	active_ca	ADC	Greenfield	\N	\N	\N	25.005	t	2025-08-29 22:58:53.950944+00	2025-11-25 17:07:54.127408+00		\N	\N	\N	preserve_local
47	Upland for RestorCap	completed	TCG	Greenfield	\N	\N	\N	24.047	t	2025-08-29 22:58:54.410349+00	2025-10-21 16:44:48.385231+00		\N	\N	\N	preserve_local
90	Moc-1 (G-Reserch)	active_ca	Align Comm.	TFO	\N	\N	\N	\N	t	2025-10-11 23:05:27.836883+00	2025-10-22 15:14:08.828731+00		\N	\N	\N	preserve_local
33	Evocative SC3	active_ca	Evocative	Assessment	\N	\N	\N	25.027	t	2025-08-29 22:58:54.122298+00	2025-10-22 15:33:09.577323+00		\N	\N	\N	preserve_local
36	IMDC - CHI B4/B5	on_hold	Iron Mountain	Renovation	\N	\N	\N	25.032	t	2025-08-29 22:58:54.194072+00	2025-10-22 15:36:42.522786+00		\N	\N	\N	preserve_local
84	Markley - Lowell, MA (Nvidia)	active_ca	Megawatt		\N	\N	\N	25.097	t	2025-09-02 02:29:21.618046+00	2026-01-05 18:08:50.340325+00		\N	\N	\N	preserve_local
34	Fibrebond T&M	cancelled	Fibrebond	Peer Review	\N	\N	\N	24.049	t	2025-08-29 22:58:54.15753+00	2026-01-16 15:50:57.86947+00		\N	\N	\N	preserve_local
53	Eppley	completed	Holder	Peer Review	\N	\N	\N	24.005	t	2025-08-29 22:58:54.520473+00	2026-01-16 15:45:05.325689+00		\N	\N	\N	preserve_local
63	ELN04 Greenfield	active_ca	Applied Digital	Greenfield	\N	\N	\N	24.081	t	2025-08-29 22:58:54.728138+00	2025-11-10 18:03:43.070945+00		\N	\N	\N	preserve_local
66	Project Longhorn DH6 Electrical Peer Review	completed	Align Comm.	--	\N	\N	\N	24.017	t	2025-08-29 22:58:54.794683+00	2025-11-14 12:59:36.773719+00		\N	\N	\N	preserve_local
81	CMH02 TFO	active	ADC		\N	\N	\N	25.005.02	t	2025-09-01 22:23:14.093638+00	2025-10-27 17:07:19.918438+00		\N	\N	\N	preserve_local
87	ATL 11	active	Switch		\N	\N	\N	25.050.01	t	2025-09-02 02:37:21.101877+00	2025-11-03 20:49:50.047508+00		\N	\N	\N	preserve_local
88	ATL 12	active	Switch		\N	\N	\N	25.050.12	t	2025-09-02 02:37:28.540931+00	2025-11-03 20:50:34.117375+00		\N	\N	\N	preserve_local
65	Project Longhorn - DH5	completed	Align Comm.	--	\N	\N	\N	24.010	t	2025-08-29 22:58:54.771052+00	2025-11-14 12:59:08.263848+00		\N	\N	\N	preserve_local
83	VA11	active	Iron Mountain		2025-09-20	\N	\N	25.093	t	2025-09-02 02:27:00.035511+00	2026-01-20 13:48:18.043464+00		\N	\N	\N	preserve_local
49	ELN03 Greenfield	active_ca	Applied Digital	Greenfield	\N	\N	\N	24.031	t	2025-08-29 22:58:54.447023+00	2026-01-16 15:32:02.78456+00		\N	\N	\N	preserve_local
58	GDC-Albuquerque, NM - 50,000 Acres	cancelled	GDC	--	\N	\N	\N	24.021	t	2025-08-29 22:58:54.622089+00	2025-11-14 13:00:54.13664+00		\N	\N	\N	preserve_local
52	DH12 DLC Expansion	completed	Jane Street	Tenant Fit Out	\N	\N	\N	24.048	t	2025-08-29 22:58:54.503793+00	2025-11-25 17:35:52.72994+00		\N	\N	\N	preserve_local
38	DFW10 Temp Power	active_ca	Loenbro	Temp Pwr	\N	\N	\N	25.034	t	2025-08-29 22:58:54.230558+00	2026-01-26 18:09:47.167456+00		\N	\N	\N	preserve_local
45	Project Intrepid	active	Prologis	Peer Review (Hourly)	\N	\N	\N	25.040	t	2025-08-29 22:58:54.374468+00	2026-01-16 16:06:03.494183+00		\N	\N	\N	preserve_local
93	DFW17B	active_ca	CyrusOne	Copy of 17A	\N	\N	\N	25.058	t	2025-10-14 16:23:46.285946+00	2025-12-29 18:06:44.074657+00		\N	\N	\N	preserve_local
44	Project Athena - San Jose CA	active	Prologis	Tenant Fit Out	\N	\N	\N	25.066.01	t	2025-08-29 22:58:54.355647+00	2026-01-12 21:32:09.178443+00		\N	\N	\N	preserve_local
35	AZP2B1 - SC02	active_ca	Iron Mountain	Renovation	\N	\N	\N	25.009	t	2025-08-29 22:58:54.175651+00	2026-01-12 22:12:34.819822+00		\N	\N	\N	preserve_local
85	Richmond Campus Masterplanning	completed	PointOne	masterplanning	2025-07-29	\N	\N	\N	t	2025-09-02 02:30:12.418641+00	2026-01-15 20:33:06.647982+00		\N	\N	\N	preserve_local
56	Project Anaconda Phase 1	cancelled	Arco	Greenfield	\N	\N	\N	25.039	t	2025-08-29 22:58:54.582039+00	2026-01-16 14:58:48.280929+00		\N	\N	\N	preserve_local
91	FAR01 Greenfield	active_ca	Applied Digital	150MW near copy of ELN04	\N	\N	\N	25.095	t	2025-10-14 16:16:30.580922+00	2026-01-16 15:34:14.273212+00		\N	\N	\N	preserve_local
92	MDC1 Peer Review	cancelled	CloudHQ	Peer Review	\N	\N	\N	\N	t	2025-10-14 16:18:26.267766+00	2026-01-16 15:38:05.340102+00		\N	\N	\N	preserve_local
60	NAL01B - Greenfield	cancelled	Stack	Greenfield	\N	\N	\N	25.004	t	2025-08-29 22:58:54.663142+00	2026-01-16 16:16:16.150876+00		\N	\N	\N	preserve_local
62	TCG - Project Sailfish	completed	TCG	Greenfield	\N	\N	\N	24.053	t	2025-08-29 22:58:54.705414+00	2026-01-16 16:19:59.964027+00		\N	\N	\N	preserve_local
23	CMH01	active	ADC	Greenfield	\N	\N	\N	27.078	t	2025-08-29 22:58:53.928586+00	2026-01-26 20:57:05.47613+00	<p>Test1</p>	{"type": "doc", "content": [{"type": "paragraph", "attrs": {"textAlign": null}, "content": [{"text": "Test1", "type": "text"}]}]}	\N	\N	preserve_local
107	Raleigh BLD 1	active	PointOne	Warm shell	2025-10-21	\N	\N	\N	t	2025-10-22 15:39:34.322758+00	2025-10-28 19:09:53.484731+00		\N	\N	\N	preserve_local
104	DFW 13	active	Databank		\N	\N	\N	\N	t	2025-10-22 15:26:14.604132+00	2025-10-22 15:27:22.903102+00		\N	\N	\N	preserve_local
103	DFW 11	active_ca	Databank		\N	\N	\N	\N	t	2025-10-22 15:26:06.029494+00	2025-10-30 22:47:18.93584+00		\N	\N	\N	preserve_local
105	DFW 12	active_ca	Databank		\N	\N	\N	\N	t	2025-10-22 15:26:20.498719+00	2025-10-30 22:47:20.301132+00		\N	\N	\N	preserve_local
108	Silver Creek	on_hold	Prologis		\N	\N	\N	\N	t	2025-10-22 16:02:50.171507+00	2025-10-22 16:02:50.171519+00		\N	\N	\N	preserve_local
109	Brokaw	on_hold	Prologis		\N	\N	\N	\N	t	2025-10-22 16:03:08.918368+00	2025-10-22 16:03:08.918377+00		\N	\N	\N	preserve_local
102	DFW 10	active_ca	Databank		\N	\N	\N	\N	t	2025-10-22 15:25:51.615018+00	2025-10-30 22:47:22.960468+00		\N	\N	\N	preserve_local
113	Wichita Falls	on_hold	Kings Branch Data		\N	\N	\N	\N	t	2025-10-24 19:20:44.262301+00	2025-11-03 18:12:50.150403+00		\N	\N	\N	preserve_local
122	Richmond - RIC2 48MW Schematic Design (AWS)	cancelled	PointOne	Greenfield with P1 and AWS N+2C	2025-12-02	\N	\N	\N	t	2025-11-23 21:44:02.161316+00	2026-01-15 20:32:11.938882+00		\N	\N	\N	preserve_local
100	Abernathy Masterplan/B1	active	ADC		2025-10-21	\N	\N	\N	t	2025-10-22 15:15:00.109887+00	2025-11-03 20:18:32.680032+00		\N	\N	\N	preserve_local
95	Miner Bld B	active	Stack		\N	\N	\N	25.106	t	2025-10-20 16:11:17.447193+00	2025-11-03 20:47:22.246426+00		\N	\N	\N	preserve_local
110	ELN03 TFO	active	Applied Digital	150MW TFO (6 Data Halls)	\N	\N	\N	25.088	t	2025-10-24 17:46:22.813449+00	2025-10-24 17:49:12.005527+00		\N	\N	\N	preserve_local
96	Miner Bld C	active	Stack		\N	\N	\N	25.108	t	2025-10-20 16:12:48.300537+00	2025-11-03 20:47:46.617269+00		\N	\N	\N	preserve_local
98	Miner Bld D	active	Stack		\N	\N	\N	25.109	t	2025-10-20 17:18:51.092639+00	2025-11-03 20:47:57.35979+00		\N	\N	\N	preserve_local
133	DFW 11 TFO	active	Databank	TFO Fitout to DB DFW 11, 24.001	2026-01-26	\N	\N	25.111	t	2026-01-12 21:55:28.707104+00	2026-01-16 15:00:20.2988+00		\N	\N	\N	preserve_local
114	Misc VDC (Heat Calcs)	active	VDC		\N	\N	\N	\N	t	2025-10-24 19:26:01.241006+00	2025-10-24 19:26:01.241022+00		\N	\N	\N	preserve_local
117	ELN02 Gen Plant	completed	Applied Digital		\N	\N	\N	24.062	t	2025-10-26 20:30:25.537461+00	2026-01-20 18:34:44.531071+00		\N	\N	\N	preserve_local
106	CHI1 TFO	active	Iron Mountain	TFO of B3/B4/B5 (Liquid Cooling Pivot)	2025-10-24	\N	\N	25.127	t	2025-10-22 15:35:14.717915+00	2025-11-03 21:01:10.921333+00		\N	\N	\N	preserve_local
119	Abernathy B2	on_hold	ADC		2026-03-27	\N	\N	\N	t	2025-11-03 20:18:56.733244+00	2026-01-25 18:36:52.599286+00		\N	\N	\N	preserve_local
120	FAR02 Greenfield	active	Applied Digital	Carbon copy of FAR01	2025-11-24	\N	250	\N	t	2025-11-14 12:39:39.508002+00	2025-11-14 12:39:39.508015+00		\N	\N	\N	preserve_local
121	FAR01 TFO	active	Applied Digital	150MW TFO for Oracle	2026-01-07	\N	\N	\N	t	2025-11-14 12:43:07.882309+00	2025-11-14 12:43:07.882324+00		\N	\N	\N	preserve_local
112	DFW 09 TFO	active	Databank		\N	\N	\N	25.102	t	2025-10-24 19:18:36.102277+00	2026-01-16 15:00:35.440596+00		\N	\N	\N	preserve_local
101	DFW 09	active_ca	Databank		\N	\N	\N	24.001	t	2025-10-22 15:25:44.411505+00	2025-10-27 16:56:17.958581+00		\N	\N	\N	preserve_local
123	HOU2	active	Databank	Arch Corgan	2025-12-01	\N	\N	25.136.01	t	2025-11-25 14:51:32.13456+00	2025-11-25 14:51:32.134575+00		\N	\N	\N	preserve_local
124	AEX01 Greenfield	active	Applied Digital	150MW Greenfield for Google	\N	\N	\N	\N	t	2025-11-25 19:58:36.898569+00	2025-11-25 19:58:36.898581+00		\N	\N	\N	preserve_local
146	General Overhead	active	SMC		\N	\N	\N	\N	t	2026-01-26 15:14:33.66324+00	2026-01-26 15:14:33.663251+00		\N	\N	\N	preserve_local
125	CMH04	active	ADC		2026-01-12	\N	\N	\N	t	2025-12-19 16:09:39.418077+00	2025-12-19 16:09:39.418091+00		\N	\N	\N	preserve_local
126	CMH03 (TFO)	active	ADC		2026-03-01	\N	\N	\N	t	2025-12-19 16:13:20.801805+00	2025-12-19 16:13:20.801819+00		\N	\N	\N	preserve_local
128	ATL 85	active	Switch		2026-01-06	\N	\N	\N	t	2025-12-22 16:48:25.224652+00	2025-12-22 16:48:25.224663+00		\N	\N	\N	preserve_local
130	Hayward - 26300 Corporate Ave	active	Prologis	72MW Site Planning/ Entitlements Programming for California	2025-12-09	\N	144	25.044.02	t	2026-01-12 21:20:56.043657+00	2026-01-16 15:59:24.164672+00		\N	\N	\N	preserve_local
134	RIC2	active	PointOne	48MW Greenfield (Everest)	2026-01-15	\N	\N	\N	t	2026-01-15 20:32:36.827364+00	2026-01-15 20:36:50.236765+00		\N	\N	\N	preserve_local
135	RIC5	active	PointOne	48MW Greenfield (Microsoft)	\N	\N	\N	\N	t	2026-01-15 20:35:14.887769+00	2026-01-15 20:36:57.28602+00		\N	\N	\N	preserve_local
138	RIC6	active	PointOne	72MW Greenfield	\N	\N	\N	\N	t	2026-01-15 20:37:38.971651+00	2026-01-15 20:37:38.971663+00		\N	\N	\N	preserve_local
139	RIC3	active	PointOne	36MW Greenfield (Microsoft)	\N	\N	\N	\N	t	2026-01-15 20:38:10.56455+00	2026-01-15 20:38:10.564559+00		\N	\N	\N	preserve_local
140	Hunlock Creek 200MW SD	active	Hunlock Creek Generating LLC	Schematic Design	2026-01-08	\N	936	25-152	t	2026-01-15 21:23:36.64478+00	2026-01-15 21:23:36.644792+00		\N	\N	\N	preserve_local
141	Compass ORD1	active	Align Comm.	TFO	2026-01-08	\N	522	\N	t	2026-01-15 21:25:08.912875+00	2026-01-15 21:25:08.912889+00		\N	\N	\N	preserve_local
144	AZP2B1  - SC02 TFO	active	Iron Mountain		\N	\N	\N	\N	t	2026-01-20 18:44:12.345762+00	2026-01-20 18:45:40.138223+00		\N	\N	\N	preserve_local
132	DFW 10 TFO	active	Databank	L2L TFO for DB DFW 10 24.001	2026-01-12	\N	\N	25.110	t	2026-01-12 21:51:41.198856+00	2026-01-16 15:01:06.39475+00		\N	\N	\N	preserve_local
136	RIC1	active	PointOne	60MW Greenfield (Microsoft)	\N	\N	\N	\N	t	2026-01-15 20:35:35.01756+00	2026-01-16 14:56:25.014765+00		\N	\N	\N	preserve_local
129	Hayward - 3525 Arden Rd	active	Prologis	72MW Site Planning/ Entitlements Programming for California	2025-12-09	\N	144	25.044.01	t	2026-01-12 21:20:17.656635+00	2026-01-16 15:59:56.464539+00		\N	\N	\N	preserve_local
115	SLC04 DH 130 (Striping)	cancelled	ADC		\N	\N	\N	\N	t	2025-10-24 19:30:39.438554+00	2026-01-16 15:25:01.125215+00		\N	\N	\N	preserve_local
143	AEX02 Greenfield	on_hold	Applied Digital	Kickoff date TBD	2026-03-01	\N	\N	\N	t	2026-01-16 14:58:16.441554+00	2026-01-16 15:30:42.70895+00		\N	\N	\N	preserve_local
145	DFW 12 TFO	active	Databank		\N	\N	\N	\N	t	2026-01-21 00:12:38.638001+00	2026-01-21 00:12:38.638018+00		\N	\N	\N	preserve_local
142	WTX1	active	QTS		2026-01-20	\N	\N	26.004	t	2026-01-16 14:54:52.392375+00	2026-01-16 16:07:43.233568+00		\N	\N	\N	preserve_local
147	Union Valley DFW01 - B1	active	NSCALE		2026-02-09	\N	\N	\N	t	2026-01-26 15:18:10.101443+00	2026-01-26 15:18:10.101456+00		\N	\N	\N	preserve_local
148	ELN04 TFO	active	Applied Digital		\N	\N	\N	\N	t	2026-01-26 18:29:32.891912+00	2026-01-26 18:29:32.891921+00		\N	\N	\N	preserve_local
99	Miner Ops and Logistics	active_ca	Stack		\N	\N	\N	25.096	t	2025-10-20 17:19:59.582202+00	2026-01-16 16:18:25.897959+00		\N	\N	\N	preserve_local
149	ORD1 Peer Review	active	CloudHQ		\N	\N	\N	25.125	t	2026-01-26 19:39:38.904542+00	2026-01-26 19:40:02.332086+00		\N	\N	\N	preserve_local
150	Neuron BOD	active	Neuron Development		2026-12-01	\N	\N	\N	t	2026-01-26 19:52:50.21302+00	2026-01-26 19:52:50.213029+00		\N	\N	\N	preserve_local
\.


--
-- PostgreSQL database dump complete
--

\unrestrict HMm8aIW0cCVI5LZfBIhJDbD9kluvikSuoEtborVkwfJ1EBBzCWYymdv4adyyezR


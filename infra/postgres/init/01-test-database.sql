-- Database for the API's end-to-end tests, created on the container's first start.
-- Its credentials are deliberately fixed and public: the role can reach only this
-- throwaway database, and the server listens on 127.0.0.1 only. CI creates the same.
CREATE ROLE reelmark_test LOGIN PASSWORD 'reelmark_test';
CREATE DATABASE reelmark_test OWNER reelmark_test;

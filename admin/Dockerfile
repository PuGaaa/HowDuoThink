FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_SENTRY_DSN=
ARG VITE_SENTRY_ENV=prod
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ENV VITE_SENTRY_ENV=${VITE_SENTRY_ENV}
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/
EXPOSE 80

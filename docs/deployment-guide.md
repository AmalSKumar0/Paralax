# Paralax - Production Deployment Guide

This guide covers deploying the **Paralax Serverless IoT Two-Way Voice Translator** to Amazon Web Services (AWS) using AWS Serverless Application Model (AWS SAM), along with provisioning the frontend dashboard and configuring physical ESP32 devices.

---

## 1. Architecture & Deployed Resources

The AWS SAM template ([template.yaml](file:///home/amalskumar/projects/College%20Projects/Continues/Paralax/template.yaml)) deploys 33 production-ready AWS resources:

| Component | AWS Resource | Purpose |
| :--- | :--- | :--- |
| **API Gateway** | `AWS::Serverless::HttpApi` | HTTP API v2 with CORS, binary media support, and sub-10ms routing overhead |
| **Device Auth** | `AWS::Serverless::Function` | Lambda authorizer validating `X-Device-Key` with salted SHA-256 and 60s caching |
| **Path A Core** | `AWS::Serverless::Function` | Low-latency synchronous streaming translation (Transcribe + Translate + Polly) |
| **Control Plane** | 3x `AWS::Serverless::Function` | Device heartbeats, configuration syncing, and remote command delivery |
| **Path B Batch** | `AWS::Serverless::StateMachine` + 4x Lambdas | Step Functions pipeline for batch audio files (Transcribe, Translate, Polly, Finalize) |
| **Admin Subsystem** | 5x `AWS::Serverless::Function` | Device fleet management, conversations, settings, metrics, and health checks |
| **Database** | 8x `AWS::DynamoDB::Table` | Pay-per-request tables with TTL automatic purging and GSIs |
| **Storage** | `AWS::S3::Bucket` | Private AES256-encrypted audio storage with 30-day lifecycle auto-purge |
| **Authentication** | `AWS::Cognito::UserPool` + Client | Secure Cognito user pool with SRP authentication for Admin Dashboard |
| **Monitoring** | 3x `AWS::CloudWatch::Alarm` | Alarms for Failure count (>5), p95 latency (>5s), and Lambda throttles |
| **Cost Guard** | `AWS::Budgets::Budget` | Email notifications when monthly spend exceeds threshold ($50 default) |

---

## 2. Prerequisites

1. **AWS Account**: An active AWS account with permissions for CloudFormation, IAM, Lambda, API Gateway, DynamoDB, S3, Step Functions, Cognito, and CloudWatch.
2. **AWS CLI**: Installed and configured:
   ```bash
   aws configure
   # Set AWS Access Key ID, Secret Access Key, and Default region (e.g. us-east-1)
   ```
3. **AWS SAM CLI**: Installed (v1.100+ recommended):
   ```bash
   sam --version
   ```
   *Installation instructions*:
   * **Linux**: `brew install aws-sam-cli` or download from [AWS SAM CLI Docs](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
   * **macOS**: `brew install aws-sam-cli`
   * **Windows**: `choco install aws-sam-cli` or installer MSI.
4. **Python 3.12**: Runtime matches the AWS Lambda configuration in `template.yaml`.

---

## 3. Step-by-Step Backend Deployment

### Step 3.1: Build Deployment Artifacts

Run SAM build to resolve dependencies from [requirements.txt](file:///home/amalskumar/projects/College%20Projects/Continues/Paralax/requirements.txt):

```bash
make build
# or:
sam build
```

> [!TIP]
> If building native C extensions for Linux on a non-Linux machine (e.g. macOS or Windows), use the containerized build flag:
> ```bash
> sam build --use-container
> ```

---

### Step 3.2: Deploy to AWS

#### Option A: Guided Interactive Deployment (Recommended for First Run)

```bash
make deploy-guided
# or:
sam deploy --guided
```

You will be prompted with the following configuration options:

```text
Stack Name [paralax-backend]: paralax-backend
AWS Region [us-east-1]: us-east-1
Parameter Environment [dev]: dev
Parameter CorsAllowOrigin [*]: *
Parameter RetentionDays [30]: 30
Parameter MaxUtteranceSec [15]: 15
Parameter MonthlyBudgetAmount [50]: 50
Parameter BudgetNotificationEmail [alert@example.com]: your-email@domain.com
Confirm changes before deploy [Y/n]: y
Allow SAM CLI IAM role creation [Y/n]: y
Disable rollback for faster debugging [y/N]: n
Save arguments to configuration file [Y/n]: y
SAM configuration file [samconfig.toml]: samconfig.toml
SAM configuration environment [default]: default
```

#### Option B: Automated Non-Interactive Deployment

Once [samconfig.toml](file:///home/amalskumar/projects/College%20Projects/Continues/Paralax/samconfig.toml) is saved:

```bash
make deploy
# or:
sam deploy
```

---

### Step 3.3: Note the Stack Outputs

Upon successful deployment, CloudFormation outputs the critical endpoint parameters:

```text
------------------------------------------------------------------------------------------------------------------------
CloudFormation outputs from deployed stack
------------------------------------------------------------------------------------------------------------------------
Outputs
------------------------------------------------------------------------------------------------------------------------
Key                 HttpApiUrl
Description         HTTP API Gateway endpoint URL
Value               https://a1b2c3d4e5.execute-api.us-east-1.amazonaws.com

Key                 UserPoolId
Description         Cognito User Pool ID for Admin Dashboard
Value               us-east-1_AbCdEf123

Key                 UserPoolClientId
Description         Cognito User Pool Client ID
Value               1234567890abcdef1234567890

Key                 AudioBucketName
Description         S3 Audio Bucket Name
Value               paralax-backend-audiobucket-1a2b3c4d5e
------------------------------------------------------------------------------------------------------------------------
```

---

## 4. Post-Deployment Configuration

### 4.1: Create Admin Dashboard User in Cognito

Create an initial administrator user in the deployed Cognito User Pool:

```bash
export USER_POOL_ID="us-east-1_AbCdEf123" # From stack outputs
export ADMIN_EMAIL="admin@yourdomain.com"

# 1. Create User
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --user-attributes Name=email,Value="$ADMIN_EMAIL" Name=email_verified,Value=true \
  --temporary-password "TemporaryPass123!" \
  --message-action SUPPRESS

# 2. Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --username "$ADMIN_EMAIL" \
  --password "YourSecurePassword#2026" \
  --permanent
```

---

### 4.2: Register Your First Physical ESP32 Hardware Device

Authenticate via Cognito to obtain a JWT ID token, then call the Admin API to provision a device:

```bash
export API_URL="https://a1b2c3d4e5.execute-api.us-east-1.amazonaws.com"
export CLIENT_ID="1234567890abcdef1234567890"

# 1. Obtain ID Token
AUTH_RESP=$(aws cognito-idp initiate-auth \
  --client-id "$CLIENT_ID" \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$ADMIN_EMAIL",PASSWORD="YourSecurePassword#2026")

ID_TOKEN=$(echo "$AUTH_RESP" | jq -r .AuthenticationResult.IdToken)

# 2. Register Device
curl -X POST "$API_URL/v1/admin/devices" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "esp32-livingroom-01",
    "name": "Living Room Translator",
    "language_a": "en-US",
    "language_b": "es-US",
    "mode": "auto"
  }'
```

**Response (Device Key shown ONCE)**:
```json
{
  "device_id": "esp32-livingroom-01",
  "device_key": "dev_live_9f83b271a01c4...",
  "status": "active",
  "config_version": 1
}
```

> [!CAUTION]
> Save the returned `device_key` securely! The backend stores only a salted SHA-256 hash. The plaintext key cannot be retrieved again.

---

### 4.3: Configure Physical ESP32 Firmware

Flash the credentials and API endpoint to your ESP32 WROOM-32 firmware:

```c
const char* WIFI_SSID     = "Your_WiFi_Network";
const char* WIFI_PASSWORD = "Your_WiFi_Password";

// Production API Gateway endpoint from stack outputs:
const char* TRANSLATE_URL = "https://a1b2c3d4e5.execute-api.us-east-1.amazonaws.com/v1/device/translate?source=auto";
const char* HEARTBEAT_URL = "https://a1b2c3d4e5.execute-api.us-east-1.amazonaws.com/v1/device/heartbeat";
const char* DEVICE_KEY    = "dev_live_9f83b271a01c4..."; // From provision response
```

---

## 5. Deploying the React Admin Dashboard

The `frontend/` directory contains a single-page React + Vite admin dashboard.

### 5.1: Configure Environment Variables

Create `frontend/.env.production`:

```env
VITE_API_BASE_URL="https://a1b2c3d4e5.execute-api.us-east-1.amazonaws.com/v1"
VITE_COGNITO_REGION="us-east-1"
VITE_COGNITO_USER_POOL_ID="us-east-1_AbCdEf123"
VITE_COGNITO_CLIENT_ID="1234567890abcdef1234567890"
VITE_MOCK_MODE="false"
VITE_ENABLE_STREAMING="false"
```

### 5.2: Build Frontend Bundle

```bash
cd frontend
npm install
npm run build
```

This creates static web assets in `frontend/dist/`.

### 5.3: Host on AWS (S3 + CloudFront) or Vercel

#### Option A: Hosting with Vercel / Netlify
Connect your repository and set the root directory to `frontend`, with build command `npm run build` and output directory `dist`.

#### Option B: Hosting with AWS S3 + CloudFront
```bash
# Create hosting bucket
aws s3 mb s3://paralax-admin-dashboard-hosting --region us-east-1

# Enable static website hosting
aws s3 website s3://paralax-admin-dashboard-hosting --index-document index.html --error-document index.html

# Sync built assets
aws s3 sync frontend/dist s3://paralax-admin-dashboard-hosting --acl public-read
```

---

## 6. Optional: Deploying with Zero-Cost Free AI APIs

If you prefer running speech-to-text and translation on **Groq's Free Tier** (Groq Whisper + Groq LLaMA 3.3) and voice synthesis via **Microsoft Edge-TTS**, configure your Groq API key:

### Method 1: Store Key in AWS Systems Manager (SSM) Parameter Store
```bash
aws ssm put-parameter \
  --name "/paralax/groq_api_key" \
  --value "gsk_YourFreeGroqApiKeyHere" \
  --type "SecureString"
```

### Method 2: Configure in Lambda Environment
Update `TranslateUtteranceFunction` environment variables in `template.yaml`:
```yaml
      Environment:
        Variables:
          AI_PROVIDER: groq
          GROQ_API_KEY: "gsk_YourFreeGroqApiKeyHere"
```
Then redeploy with `make deploy`.

---

## 7. Teardown / Deleting Resources

When you wish to remove all AWS resources to avoid ongoing costs:

```bash
# 1. Empty S3 Bucket (S3 buckets with objects cannot be deleted by CloudFormation)
aws s3 rm s3://paralax-backend-audiobucket-1a2b3c4d5e --recursive

# 2. Delete CloudFormation Stack
sam delete --stack-name paralax-backend
```

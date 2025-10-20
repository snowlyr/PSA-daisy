from openai import AzureOpenAI

# gets the API Key from environment variable AZURE_OPENAI_API_KEY
client = AzureOpenAI(
    # https://learn.microsoft.com/azure/ai-services/openai/reference#rest-api-versioning
    api_version="2025-01-01-preview",
    api_key="<your-api-key-here>",
    # https://learn.microsoft.com/azure/cognitive-services/openai/how-to/create-resource?pivots=web-portal#create-a-resource
    azure_endpoint="https://psacodesprint2025.azure-api.net/openai/deployments/gpt-4.1-nano/chat/completions?api-version=2025-01-01-preview"
)
# Edit api-version and deployment id as required

inp = "Can I use PowerBI's REST API to help me with my data analysis with you?"

completion = client.chat.completions.create(
    model="gpt-4.1-nano",  # edit deployment name here too
    messages=[
        {
            "role": "user",
            "content": inp,
        },
    ],
)
n = len(f"Input Text: {inp}")
print("=" * n)
print(f"Input Text: {inp}")
print("=" * n)
print(f"Output Text: {completion.to_dict()["choices"][0]["message"]["content"]}")

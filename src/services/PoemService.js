// src/services/PoemService.js
const OpenAI = require('openai');
const Poem = require('../models/Poem');
const User = require('../models/User');

class PoemService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    async generatePoemFree(poemData) {
        try {
            const { 
                poemLength, 
            } = poemData;

            // Generate poem using OpenAI
            const completion = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: this.constructSystemPrompt(poemData)
                    },
                    {
                        role: "user",
                        content: this.constructUserPrompt(poemData)
                    }
                ],
                temperature: 0.8,
                max_tokens: this.getMaxTokensByLength(poemLength),
                presence_penalty: 0.6,
                frequency_penalty: 0.6
            });

            const generatedPoem = completion.choices[0].message.content;

            return generatedPoem;
        } catch (error) {
            console.error('Poem generation error:', error);
            throw new Error(`Failed to generate poem: ${error.message}`);
        }
    }


    async generatePoem(userId, poemData) {
        try {
            // Get user and check credits/subscription
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Check if free user has credits
            if (user.subscriptionPlan === 'free' && user.poemCredits <= 0) {
                throw new Error('No poem credits remaining. Please upgrade your plan.');
            }

            const { 
                poemType, 
                poemLength, 
                poeticDevice, 
                tone, 
                personalization, 
                rhymingPattern, 
                language,
                keywords 
            } = poemData;

            // Generate poem using OpenAI
            const completion = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: this.constructSystemPrompt(poemData)
                    },
                    {
                        role: "user",
                        content: this.constructUserPrompt(poemData)
                    }
                ],
                temperature: 0.8,
                max_tokens: this.getMaxTokensByLength(poemLength),
                presence_penalty: 0.6,
                frequency_penalty: 0.6
            });

            const generatedPoem = completion.choices[0].message.content;

            // Save the generated poem
            const poem = await Poem.create({
                userId,
                poem: generatedPoem,
                poemType,
                poemLength,
                poeticDevice,
                tone,
                personalization,
                rhymingPattern,
                language,
                keywords,
                created: new Date()
            });

            // Deduct credit if free user
            if (user.subscriptionPlan === 'free') {
                await User.findByIdAndUpdate(userId, {
                    $inc: { poemCredits: -1 }
                });
            }

            return poem;
        } catch (error) {
            console.error('Poem generation error:', error);
            throw new Error(`Failed to generate poem: ${error.message}`);
        }
    }

    constructSystemPrompt(poemData) {
        const { poemType, poeticDevice, tone, language } = poemData;
        return `You are a professional poet specializing in ${poemType} poetry.
                Create poetry using ${poeticDevice} as the main poetic device.
                The tone should be ${tone}.
                Write in ${language}.
                Focus on creating emotionally resonant and structurally sound poetry.`;
    }

    constructUserPrompt(poemData) {
        const { 
            poemType, 
            poemLength, 
            poeticDevice, 
            tone,
            personalization,
            rhymingPattern,
            keywords 
        } = poemData;

        let verses = '';
        switch(poemLength) {
            case 'Short': verses = '2 verses'; break;
            case 'Medium': verses = '4 verses'; break;
            case 'Long': verses = '6 verses'; break;
        }

        return `
            Write a ${poemType} poem with the following parameters:
            Length: ${verses}
            Poetic Devices: ${poeticDevice}
            Tone: ${tone}
            Personalization: ${personalization}
            Rhyming Pattern: ${rhymingPattern}
            Theme/Keywords: ${keywords}

            Instructions:
            - Generate exactly ${verses}
            - Do not repeat lines or verses
            - Ensure the poem is coherent and well-structured
            - Follow the specified rhyming pattern
            - Incorporate any personalization elements provided
            - Use the specified poetic device prominently
        `;
    }

    getMaxTokensByLength(poemLength) {
        const tokenLimits = {
            'Short': 200,
            'Medium': 400,
            'Long': 600
        };
        return tokenLimits[poemLength] || 200;
    }

    // Get user's poems with pagination and filters
    async getUserPoems(userId, options = {}) {
        const { 
            page = 1, 
            limit = 10, 
            poemType, 
            language, 
            sortBy = 'created',
            sortOrder = -1 
        } = options;

        const query = { userId };
        if (poemType) query.poemType = poemType;
        if (language) query.language = language;

        const poems = await Poem.find(query)
            .sort({ [sortBy]: sortOrder })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Poem.countDocuments(query);

        return {
            poems,
            pagination: {
                current: page,
                total: Math.ceil(total / limit),
                totalPoems: total
            }
        };
    }

    // Delete a poem
    async deletePoem(poemId, userId) {
        const poem = await Poem.findOneAndDelete({ _id: poemId, userId });
        if (!poem) {
            throw new Error('Poem not found or unauthorized');
        }
        return poem;
    }
}

// Export a single instance of the service
module.exports = new PoemService();
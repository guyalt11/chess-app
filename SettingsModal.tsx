import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Platform,
    StatusBar,
    SafeAreaView,
} from 'react-native';
import Slider from '@react-native-community/slider';

interface EloOption {
    elo: number;
    label: string;
    description: string;
    color: string;
}

const ELO_OPTIONS: EloOption[] = [
    { elo: 400, label: 'Beginner', description: 'Just learning the rules', color: '#74b772' },
    { elo: 600, label: 'Novice', description: 'Knows basic tactics', color: '#8bc34a' },
    { elo: 800, label: 'Amateur', description: 'Starting to plan ahead', color: '#c6d440' },
    { elo: 1000, label: 'Club Player', description: 'Comfortable in most positions', color: '#f0d030' },
    { elo: 1200, label: 'Intermediate', description: 'Recognises common patterns', color: '#f0a830' },
    { elo: 1400, label: 'Adv. Amateur', description: 'Strong tactical awareness', color: '#f08030' },
    { elo: 1600, label: 'Expert', description: 'Solid positional understanding', color: '#e05030' },
    { elo: 1800, label: 'Candidate', description: 'Dangerous in the endgame', color: '#d03050' },
    { elo: 2000, label: 'National Master', description: 'Precise calculation', color: '#c030c0' },
    { elo: 2200, label: 'FIDE Master', description: 'Tournament-level threat', color: '#9040d0' },
    { elo: 2400, label: 'Int\'l Master', description: 'Near-flawless strategy', color: '#6060e0' },
    { elo: 2600, label: 'Grandmaster', description: 'Elite level competitor', color: '#4080e0' },
    { elo: 2800, label: 'Super GM', description: 'World championship caliber', color: '#03DAC6' },
];

interface Props {
    visible: boolean;
    currentElo: number;
    onSelectElo: (elo: number) => void;
    onClose: () => void;
    dbMovesCount: number;
    onDbMovesCountChange: (count: number) => void;
    dbMinGames: number;
    onDbMinGamesChange: (minGames: number) => void;
    dbMinRating: number | null;
    onDbMinRatingChange: (rating: number | null) => void;
    dbMaxRating: number | null;
    onDbMaxRatingChange: (rating: number | null) => void;
    dbPercentageThreshold: number;
    onDbPercentageThresholdChange: (threshold: number) => void;
}

// Community Slider Component
const CommunitySlider = ({ 
    value, 
    onValueChange, 
    minimumValue, 
    maximumValue, 
    step = 1,
    label,
    description
}: {
    value: number;
    onValueChange: (value: number) => void;
    minimumValue: number;
    maximumValue: number;
    step?: number;
    label: string;
    description?: string;
}) => {
    return (
        <View style={styles.sliderContainer}>
            <View style={styles.sliderHeader}>
                <Text style={styles.sliderLabel}>{label}</Text>
                <Text style={styles.sliderValue}>{value}</Text>
            </View>
            {description && (
                <Text style={styles.sliderDescription}>{description}</Text>
            )}
            <Slider
                style={styles.communitySlider}
                minimumValue={minimumValue}
                maximumValue={maximumValue}
                step={step}
                value={value}
                onValueChange={onValueChange}
                minimumTrackTintColor="#3F8F88"
                maximumTrackTintColor="#E0E0E0"
            />
        </View>
    );
};

export default function SettingsModal({ 
    visible, 
    currentElo, 
    onSelectElo, 
    onClose,
    dbMovesCount,
    onDbMovesCountChange,
    dbMinGames,
    onDbMinGamesChange,
    dbMinRating,
    onDbMinRatingChange,
    dbMaxRating,
    onDbMaxRatingChange,
    dbPercentageThreshold,
    onDbPercentageThresholdChange
}: Props) {
    if (!visible) return null;

    return (
        <View style={styles.overlay}>
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft} />
                    <Text style={styles.headerTitle}>Settings</Text>
                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                        <Text style={styles.closeButtonText}>✕</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView
                    style={styles.scroll}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                >
                    {/* Section Label */}
                    <Text style={styles.sectionLabel}>🤖  Bot Strength</Text>
                    <Text style={styles.sectionSub}>Choose the Elo rating of the computer opponent</Text>

                    {/* Current Selection Banner */}
                    <View style={[
                        styles.selectedBanner,
                        { borderColor: ELO_OPTIONS.find(o => o.elo === currentElo)?.color ?? '#3F8F88' },
                    ]}>
                        <View>
                            <Text style={styles.selectedBannerLabel}>
                                {ELO_OPTIONS.find(o => o.elo === currentElo)?.label ?? 'Custom'}
                            </Text>
                            <Text style={styles.selectedBannerElo}>Elo {currentElo}</Text>
                        </View>
                        <View style={[
                            styles.eloBadge,
                            { backgroundColor: ELO_OPTIONS.find(o => o.elo === currentElo)?.color ?? '#3F8F88' },
                        ]}>
                            <Text style={styles.eloBadgeText}>ACTIVE</Text>
                        </View>
                    </View>

                    {/* ELO Grid */}
                    <View style={styles.grid}>
                        {ELO_OPTIONS.map((option) => {
                            const isSelected = option.elo === currentElo;
                            return (
                                <TouchableOpacity
                                    key={option.elo}
                                    style={[
                                        styles.card,
                                        isSelected && { borderColor: option.color, borderWidth: 2 },
                                    ]}
                                    onPress={() => onSelectElo(option.elo)}
                                    activeOpacity={0.7}
                                >
                                    {/* Colored top stripe */}
                                    <View style={[styles.cardStripe, { backgroundColor: option.color }]} />
                                    <View style={styles.cardBody}>
                                        <Text style={styles.cardElo}>{option.elo}</Text>
                                        <Text style={styles.cardLabel}>{option.label}</Text>
                                        <Text style={styles.cardDesc} numberOfLines={2}>{option.description}</Text>
                                    </View>
                                    {isSelected && (
                                        <View style={[styles.checkBadge, { backgroundColor: option.color }]}>
                                            <Text style={styles.checkText}>✓</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <View style={{ height: 40 }} />

                    {/* Database Settings Section */}
                    <Text style={styles.sectionLabel}>📊 Database Settings</Text>
                    <Text style={styles.sectionSub}>Configure opening database parameters</Text>

                    {/* Moves Count Slider */}
                    <CommunitySlider
                        label="Number of Moves"
                        description="Maximum number of moves to fetch from database"
                        value={dbMovesCount}
                        onValueChange={onDbMovesCountChange}
                        minimumValue={1}
                        maximumValue={15}
                        step={1}
                    />

                    {/* Min Games Slider */}
                    <CommunitySlider
                        label="Minimum Games Threshold"
                        description="Minimum games a move must have to be included"
                        value={dbMinGames}
                        onValueChange={onDbMinGamesChange}
                        minimumValue={1}
                        maximumValue={50}
                        step={1}
                    />

                    {/* Percentage Threshold Slider */}
                    <CommunitySlider
                        label="Percentage Threshold"
                        description="Only show moves played above this percentage"
                        value={dbPercentageThreshold}
                        onValueChange={onDbPercentageThresholdChange}
                        minimumValue={1}
                        maximumValue={10}
                        step={1}
                    />

                    {/* Rating Range Settings */}
                    <View style={styles.settingCard}>
                        <Text style={styles.settingLabel}>Player Rating Range</Text>
                        <Text style={styles.settingDesc}>Filter games by player rating (optional)</Text>
                        
                        {/* Min Rating Slider */}
                        <CommunitySlider
                            label="Minimum Rating"
                            value={dbMinRating || 800}
                            onValueChange={(value) => onDbMinRatingChange(value === 800 ? null : value)}
                            minimumValue={800}
                            maximumValue={2900}
                            step={100}
                        />
                        
                        {/* Max Rating Slider */}
                        <CommunitySlider
                            label="Maximum Rating"
                            value={dbMaxRating || 2900}
                            onValueChange={(value) => onDbMaxRatingChange(value === 2900 ? null : value)}
                            minimumValue={800}
                            maximumValue={2900}
                            step={100}
                        />
                        
                        {/* Clear Button */}
                        <TouchableOpacity 
                            style={styles.clearRatingsButton}
                            onPress={() => {
                                onDbMinRatingChange(null);
                                onDbMaxRatingChange(null);
                            }}
                        >
                            <Text style={styles.clearRatingsButtonText}>Clear Rating Filters</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#D9FDF8',
        zIndex: 2000,
    },
    safeArea: {
        flex: 1,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#3F8F88',
    },
    headerLeft: {
        width: 36,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#3F8F88',
        letterSpacing: 1,
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#3F8F88',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButtonText: {
        color: '#D9FDF8',
        fontSize: 16,
        fontWeight: 'bold',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 20,
    },
    sectionLabel: {
        fontSize: 18,
        fontWeight: '700',
        color: '#3F8F88',
        marginBottom: 4,
    },
    sectionSub: {
        fontSize: 13,
        color: '#1A433E',
        marginBottom: 18,
    },
    selectedBanner: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 2,
        padding: 16,
        marginBottom: 20,
    },
    selectedBannerLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: '#3F8F88',
    },
    selectedBannerElo: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    eloBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    eloBadgeText: {
        color: '#000',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    card: {
        width: '48%',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        marginBottom: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#3F8F88',
        position: 'relative',
    },
    cardStripe: {
        height: 5,
        width: '100%',
    },
    cardBody: {
        padding: 12,
    },
    cardElo: {
        fontSize: 22,
        fontWeight: '800',
        color: '#3F8F88',
        marginBottom: 2,
    },
    cardLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#3F8F88',
        marginBottom: 4,
    },
    cardDesc: {
        fontSize: 11,
        color: '#666',
        lineHeight: 15,
    },
    checkBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 22,
        height: 22,
        borderRadius: 11,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkText: {
        color: '#000',
        fontSize: 12,
        fontWeight: '900',
    },
    // Database Settings Styles
    settingCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#3F8F88',
    },
    settingLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: '#3F8F88',
        marginBottom: 4,
    },
    settingDesc: {
        fontSize: 12,
        color: '#666',
        marginBottom: 12,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    settingButton: {
        backgroundColor: '#3F8F88',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        minWidth: 50,
        alignItems: 'center',
    },
    settingButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    settingValue: {
        backgroundColor: '#F0F8F6',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 8,
        minWidth: 60,
        alignItems: 'center',
    },
    settingValueText: {
        color: '#3F8F88',
        fontSize: 16,
        fontWeight: '700',
    },
    ratingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 16,
    },
    ratingInput: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    ratingLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#3F8F88',
        minWidth: 35,
    },
    ratingButton: {
        flex: 1,
        backgroundColor: '#3F8F88',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        alignItems: 'center',
    },
    ratingButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '600',
    },
    clearRatingsButton: {
        backgroundColor: '#E74C3C',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 12,
    },
    clearRatingsButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    ratingClearButton: {
        backgroundColor: '#E74C3C',
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    ratingClearButtonText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '700',
    },
    // Slider Styles
    sliderContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#3F8F88',
    },
    communitySlider: {
        width: '100%',
        height: 40,
    },
    sliderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sliderLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: '#3F8F88',
    },
    sliderValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#3F8F88',
    },
    sliderDescription: {
        fontSize: 12,
        color: '#666',
        fontStyle: 'italic',
        marginTop: -8,
        marginBottom: 8,
        marginHorizontal: 4,
    },
    sliderValueContainer: {
        backgroundColor: '#F0F8F6',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
        minWidth: 50,
        textAlign: 'center',
    },
    sliderTrack: {
        height: 8,
        backgroundColor: '#E0E0E0',
        borderRadius: 4,
        position: 'relative',
    },
    sliderFill: {
        height: '100%',
        backgroundColor: '#3F8F88',
        borderRadius: 4,
        position: 'absolute',
        left: 0,
        top: 0,
    },
    sliderThumb: {
        width: 24,
        height: 24,
        backgroundColor: '#3F8F88',
        borderRadius: 12,
        position: 'absolute',
        top: -8,
        marginLeft: -12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    sliderThumbActive: {
        backgroundColor: '#2C7A6F',
        transform: [{ scale: 1.2 }],
    },
    // Step Slider Styles
    stepControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    stepButton: {
        backgroundColor: '#3F8F88',
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    stepButtonDisabled: {
        backgroundColor: '#CCCCCC',
    },
    stepButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
    },
    stepButtonTextDisabled: {
        color: '#888888',
    },
    stepIndicator: {
        flex: 1,
        height: 40,
    },
    stepScrollContent: {
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    stepDot: {
        backgroundColor: '#E0E0E0',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        marginHorizontal: 4,
        minWidth: 32,
        alignItems: 'center',
    },
    stepDotActive: {
        backgroundColor: '#3F8F88',
    },
    stepDotText: {
        color: '#666666',
        fontSize: 12,
        fontWeight: '600',
    },
    stepDotTextActive: {
        color: '#FFFFFF',
    },

});

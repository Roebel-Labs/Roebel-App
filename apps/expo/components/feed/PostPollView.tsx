import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { PostPollRecord } from '@/lib/types/feed';
import { fetchPollVotes, submitPollVote, getUserPollVote } from '@/lib/supabase-posts';

type Props = {
  poll: PostPollRecord;
  walletAddress: string | undefined;
};

export default function PostPollView({ poll, walletAddress }: Props) {
  const { colors } = useTheme();
  const [voteCounts, setVoteCounts] = useState<number[]>(poll.options.map(() => 0));
  const [totalVotes, setTotalVotes] = useState(0);
  const [userVote, setUserVote] = useState<number[] | null>(null);
  const [isVoting, setIsVoting] = useState(false);

  const isExpired = new Date(poll.expires_at) < new Date();
  const hasVoted = userVote !== null;
  const showResults = hasVoted || isExpired;

  useEffect(() => {
    loadPollData();
  }, [poll.id]);

  const loadPollData = async () => {
    const [votes, myVote] = await Promise.all([
      fetchPollVotes(poll.id),
      walletAddress ? getUserPollVote(poll.id, walletAddress) : Promise.resolve(null),
    ]);

    // Calculate vote counts per option
    const counts = poll.options.map((_, index) =>
      votes.filter((v) => v.selected_options.includes(index)).length
    );
    setVoteCounts(counts);
    setTotalVotes(votes.length);
    setUserVote(myVote);
  };

  const handleVote = async (optionIndex: number) => {
    if (!walletAddress || hasVoted || isExpired || isVoting) return;
    setIsVoting(true);

    try {
      const selected = poll.poll_type === 'multi' ? [optionIndex] : [optionIndex];
      await submitPollVote(poll.id, walletAddress, selected);
      setUserVote(selected);

      // Optimistic update
      setVoteCounts((prev) => {
        const next = [...prev];
        next[optionIndex]++;
        return next;
      });
      setTotalVotes((prev) => prev + 1);
    } catch (err) {
      console.error('Error voting:', err);
    } finally {
      setIsVoting(false);
    }
  };

  const formatExpiry = () => {
    if (isExpired) return 'Abgelaufen';
    const diff = new Date(poll.expires_at).getTime() - Date.now();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `Noch ${days} Tag${days > 1 ? 'e' : ''}`;
    if (hours > 0) return `Noch ${hours} Std.`;
    return 'Endet bald';
  };

  return (
    <View style={styles.container}>
      {poll.options.map((option, index) => {
        const count = voteCounts[index] || 0;
        const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isSelected = userVote?.includes(index);

        return (
          <Pressable
            key={index}
            onPress={() => handleVote(index)}
            disabled={showResults || isVoting}
            style={[
              styles.option,
              {
                borderColor: isSelected ? colors.primary : colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            {showResults && (
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${percentage}%`,
                    backgroundColor: isSelected ? colors.primaryLight : colors.surfaceSecondary,
                  },
                ]}
              />
            )}
            <View style={styles.optionContent}>
              <Text
                style={[
                  styles.optionText,
                  {
                    color: colors.textPrimary,
                    fontFamily: isSelected ? 'Inter-Medium' : 'Inter-Regular',
                  },
                ]}
                numberOfLines={1}
              >
                {option}
              </Text>
              {showResults && (
                <Text style={[styles.percentage, { color: colors.textSecondary }]}>
                  {percentage}%
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textTertiary }]}>
          {totalVotes} Stimme{totalVotes !== 1 ? 'n' : ''} · {formatExpiry()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  option: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    minHeight: 40,
    justifyContent: 'center',
  },
  progressBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 7,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionText: {
    fontSize: 14,
    flex: 1,
  },
  percentage: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    marginLeft: 8,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 4,
  },
  footerText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
});

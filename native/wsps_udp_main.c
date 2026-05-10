#include "wsps_udp_reader.h"

#include <errno.h>
#include <getopt.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static volatile sig_atomic_t g_running = 1;

static void handle_signal(int signo) {
    (void) signo;
    g_running = 0;
}

static void print_usage(const char *argv0) {
    fprintf(stderr,
            "Usage: %s -p <port> [-b bind_ip] [-t timeout_ms] [-n count]\n"
            "Example: %s -p 5000 -b 0.0.0.0\n",
            argv0, argv0);
}

int main(int argc, char **argv) {
    const char *bind_ip = "0.0.0.0";
    int opt;
    int timeout_ms = 30000;
    long count = -1;
    char *endptr = NULL;
    unsigned long port_ul = 0;
    uint16_t port = 0;
    long received = 0;
    int sockfd;

    while ((opt = getopt(argc, argv, "b:p:t:n:h")) != -1) {
        switch (opt) {
            case 'b':
                bind_ip = optarg;
                break;
            case 'p':
                errno = 0;
                port_ul = strtoul(optarg, &endptr, 10);
                if (errno != 0 || endptr == optarg || *endptr != '\0' || port_ul > 65535UL) {
                    fprintf(stderr, "invalid port: %s\n", optarg);
                    return 2;
                }
                port = (uint16_t) port_ul;
                break;
            case 't':
                errno = 0;
                timeout_ms = (int) strtol(optarg, &endptr, 10);
                if (errno != 0 || endptr == optarg || *endptr != '\0' || timeout_ms < 0) {
                    fprintf(stderr, "invalid timeout_ms: %s\n", optarg);
                    return 2;
                }
                break;
            case 'n':
                errno = 0;
                count = strtol(optarg, &endptr, 10);
                if (errno != 0 || endptr == optarg || *endptr != '\0' || count == 0) {
                    fprintf(stderr, "invalid count: %s\n", optarg);
                    return 2;
                }
                break;
            case 'h':
            default:
                print_usage(argv[0]);
                return (opt == 'h') ? 0 : 2;
        }
    }

    if (port == 0U) {
        print_usage(argv[0]);
        return 2;
    }

    sockfd = wsps_udp_open_listener(bind_ip, port);
    if (sockfd < 0) {
        perror("wsps_udp_open_listener");
        return 1;
    }

    signal(SIGINT, handle_signal);
    signal(SIGTERM, handle_signal);

    fprintf(stderr, "Listening for WSPS UDP packets on %s:%u\n", bind_ip, port);

    while (g_running && (count < 0 || received < count)) {
        wsps_udp_frame_t frame;
        char error_buf[256];
        int rc = wsps_udp_receive_frame(sockfd, &frame, timeout_ms, error_buf, sizeof(error_buf));

        if (rc == 1) {
            fprintf(stderr, "timeout waiting for packet\n");
            continue;
        }
        if (rc != 0) {
            fprintf(stderr, "packet parse error: %s\n", error_buf);
            continue;
        }

        wsps_udp_print_frame(&frame);
        ++received;
    }

    close(sockfd);
    return 0;
}
